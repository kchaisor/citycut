"""Victorian Building Permit Activity Data — address-normalised BCA class join."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import requests

BCA_2024_URL = (
    "https://www.bpc.vic.gov.au/__data/assets/file/0016/26521/"
    "VBA-DataVic-Building-Permits-2024-December.xlsb"
)
VICMAP_ADDRESS_WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs"

BCA_CLASS_TO_USE: dict[str, str] = {
    "1": "residential",
    "2": "residential",
    "3": "residential",
    "4": "residential",
    "5": "retail",
    "6": "commercial",
    "7": "civic",
    "8": "industrial",
    "9": "civic",
    "10": "recreation",
}

STREET_ABBR = {
    "STREET": "ST",
    "ROAD": "RD",
    "AVENUE": "AVE",
    "PARADE": "PDE",
    "DRIVE": "DR",
    "COURT": "CT",
    "PLACE": "PL",
    "LANE": "LN",
    "HIGHWAY": "HWY",
    "CRESCENT": "CRES",
    "BOULEVARD": "BLVD",
}


def normalize_address(raw: str | None) -> str | None:
    if not raw or not isinstance(raw, str):
        return None
    s = raw.upper().strip()
    s = re.sub(r"[^A-Z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    for full, abbr in STREET_ABBR.items():
        s = re.sub(rf"\b{full}\b", abbr, s)
    return s or None


def fetch_vicmap_addresses(bounds: dict[str, float]) -> gpd.GeoDataFrame | None:
    bbox = f"{bounds['west']},{bounds['south']},{bounds['east']},{bounds['north']},CRS:84"
    url = (
        f"{VICMAP_ADDRESS_WFS}?service=WFS&version=2.0.0&request=GetFeature"
        f"&typeNames=open-data-platform:address&outputFormat=application/json"
        f"&srsName=EPSG:4326&count=50000&bbox={bbox}"
    )
    try:
        response = requests.get(url, timeout=180, headers={"Accept": "application/json"})
        if response.status_code in (401, 403, 429):
            print(f"[enrichment] Vicmap address HTTP {response.status_code}", file=sys.stderr)
            return None
        response.raise_for_status()
        gdf = gpd.GeoDataFrame.from_features(response.json().get("features", []), crs="EPSG:4326")
        if gdf.empty:
            return None
        gdf["norm"] = gdf["ezi_address"].map(normalize_address) if "ezi_address" in gdf.columns else None
        return gdf[gdf["norm"].notna()]
    except Exception as exc:
        print(f"[enrichment] Vicmap address failed: {exc}", file=sys.stderr)
        return None


def download_bca_xlsb(dest: Path) -> tuple[bool, str | None]:
    if dest.is_file() and dest.stat().st_size > 10_000:
        return True, None
    try:
        response = requests.get(BCA_2024_URL, timeout=180, allow_redirects=True)
        if response.status_code in (401, 403, 429):
            return False, f"BCA xlsb HTTP {response.status_code} ({BCA_2024_URL})"
        if not response.ok:
            return False, f"BCA xlsb HTTP {response.status_code}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(response.content)
        if dest.stat().st_size < 10_000:
            return False, "BCA download too small (likely HTML challenge page)"
        return True, None
    except Exception as exc:
        return False, str(exc)


def load_bca_permits(xlsb_path: Path) -> pd.DataFrame | None:
    try:
        from pyxlsb import open_workbook
    except ImportError:
        print("[enrichment] pyxlsb not installed", file=sys.stderr)
        return None
    rows: list[dict[str, Any]] = []
    with open_workbook(str(xlsb_path)) as wb:
        sheet = wb.sheets[0]
        headers: list[str] | None = None
        with wb.get_sheet(sheet) as sh:
            for i, row in enumerate(sh.rows()):
                values = [c.v for c in row]
                if i == 0:
                    headers = [str(v).strip().lower().replace(" ", "_") if v else f"col_{j}" for j, v in enumerate(values)]
                    continue
                if not headers:
                    continue
                record = dict(zip(headers, values))
                rows.append(record)
    if not rows:
        return None
    df = pd.DataFrame(rows)
    return df


def bca_class_column(df: pd.DataFrame) -> str | None:
    for name in df.columns:
        if "bca" in name and "class" in name:
            return name
        if name in ("building_class", "building_classification", "class"):
            return name
    for name in df.columns:
        if "class" in name:
            return name
    return None


def bca_address_column(df: pd.DataFrame) -> str | None:
    for name in df.columns:
        if "site_address" in name or name == "address":
            return name
        if "street" in name and "address" in name:
            return name
    return None


def build_bca_address_index(df: pd.DataFrame) -> dict[str, str]:
    addr_col = bca_address_column(df)
    class_col = bca_class_column(df)
    if not addr_col or not class_col:
        return {}
    index: dict[str, str] = {}
    for _, row in df.iterrows():
        norm = normalize_address(str(row.get(addr_col) or ""))
        if not norm:
            continue
        raw_class = str(row.get(class_col) or "").strip()
        digit = raw_class[0] if raw_class else ""
        use = BCA_CLASS_TO_USE.get(digit)
        if not use:
            continue
        index.setdefault(norm, use)
    return index


def bca_use_for_buildings(
    buildings: gpd.GeoDataFrame,
    addresses: gpd.GeoDataFrame | None,
    bca_index: dict[str, str],
) -> pd.Series:
    result = pd.Series([None] * len(buildings), index=buildings.index, dtype=object)
    if not bca_index or addresses is None or addresses.empty:
        return result
    joined = gpd.sjoin(buildings, addresses[["norm", "geometry"]], how="left", predicate="intersects")
    for idx, group in joined.groupby(level=0):
        norms = group["norm"].dropna().unique()
        for norm in norms:
            use = bca_index.get(str(norm))
            if use:
                result.loc[idx] = (use, "bca")
                break
    return result


def load_bca_index(cache_dir: Path, bounds: dict[str, float]) -> tuple[dict[str, str], dict[str, Any]]:
    meta: dict[str, Any] = {"status": "not_attempted"}
    dest = cache_dir / "bca-2024.xlsb"
    ok, err = download_bca_xlsb(dest)
    if not ok:
        meta = {"status": "blocked" if err and "403" in err else "failed", "detail": err, "url": BCA_2024_URL}
        return {}, meta
    df = load_bca_permits(dest)
    if df is None or df.empty:
        meta = {"status": "failed", "detail": "Could not parse BCA xlsb", "url": BCA_2024_URL}
        return {}, meta
    index = build_bca_address_index(df)
    meta = {
        "status": "loaded" if index else "empty",
        "url": BCA_2024_URL,
        "permitRows": len(df),
        "addressKeys": len(index),
    }
    return index, meta
