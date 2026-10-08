"""CoM CLUE block spatial join + floor-space dominant use (2024)."""

from __future__ import annotations

import sys
from typing import Any

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import shape

COM_API = "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets"
CLUE_BLOCKS_SLUG = "blocks-for-census-of-land-use-and-employment-clue"
FLOOR_SPACE_SLUG = "floor-space-by-use-by-block"

SKIP_FLOOR_COLUMNS = {
    "census_year",
    "block_id",
    "clue_small_area",
    "total_floor_space_in_block",
    "common_area",
    "private_outdoor_space",
    "public_display_area",
    "square_promenade",
    "park_reserve",
    "transport",
    "storage",
}

UNOCCUPIED_PREFIX = "unoccupied_"
PARKING_PREFIX = "parking_"

COLUMN_TO_USE: dict[str, str] = {
    "house_townhouse": "residential",
    "residential_apartment": "residential",
    "student_accommodation": "residential",
    "institutional_accommodation": "residential",
    "office": "commercial",
    "commercial_accommodation": "commercial",
    "wholesale": "commercial",
    "business_services": "commercial",
    "retail_shop": "retail",
    "retail_showroom": "retail",
    "retail_stall": "retail",
    "retail_cars": "retail",
    "manufacturing": "industrial",
    "workshop_studio": "industrial",
    "equipment_installation": "industrial",
    "hospital_clinic": "civic",
    "educational_research": "civic",
    "community_use": "civic",
    "entertainment_recreation_indoor": "recreation",
    "sports_and_recreation_outdoor": "recreation",
    "performances_conferences_ceremonies": "recreation",
}


def _dominant_use_from_row(row: dict[str, Any]) -> tuple[str, str] | None:
    best_col = None
    best_val = 0.0
    for key, val in row.items():
        if key in SKIP_FLOOR_COLUMNS or key.startswith(UNOCCUPIED_PREFIX) or key.startswith(PARKING_PREFIX):
            continue
        use = COLUMN_TO_USE.get(key)
        if not use:
            continue
        try:
            num = float(val) if val is not None else 0.0
        except (TypeError, ValueError):
            num = 0.0
        if num > best_val:
            best_val = num
            best_col = key
    if best_col is None or best_val <= 0:
        return None
    return COLUMN_TO_USE[best_col], best_col


def fetch_floor_space_table(census_year: str = "2024") -> dict[int, tuple[str, str]]:
    """block_id -> (use, dominant_column)."""
    out: dict[int, tuple[str, str]] = {}
    offset = 0
    limit = 100
    while True:
        url = (
            f"{COM_API}/{FLOOR_SPACE_SLUG}/records"
            f"?limit={limit}&offset={offset}&refine=census_year:{census_year}"
        )
        response = requests.get(url, timeout=120)
        if response.status_code in (401, 403, 429):
            print(f"[enrichment] CLUE floor space HTTP {response.status_code}", file=sys.stderr)
            return out
        response.raise_for_status()
        body = response.json()
        results = body.get("results") or []
        if not results:
            break
        for row in results:
            block_id = row.get("block_id")
            if block_id is None:
                continue
            dom = _dominant_use_from_row(row)
            if dom:
                out[int(block_id)] = dom
        offset += len(results)
        if offset >= body.get("total_count", 0):
            break
    return out


def fetch_clue_blocks_gdf() -> gpd.GeoDataFrame | None:
    url = f"{COM_API}/{CLUE_BLOCKS_SLUG}/exports/geojson"
    try:
        response = requests.get(url, timeout=300)
        if response.status_code in (401, 403, 429):
            print(f"[enrichment] CLUE blocks HTTP {response.status_code}", file=sys.stderr)
            return None
        if response.status_code >= 400:
            print(f"[enrichment] CLUE blocks HTTP {response.status_code}", file=sys.stderr)
            return None
        data = response.json()
        features = data.get("features") or []
        rows = []
        for feature in features:
            props = feature.get("properties") or {}
            geom = feature.get("geometry")
            if not geom:
                continue
            block_id = props.get("block_id")
            if block_id is None:
                continue
            rows.append({"block_id": int(block_id), "geometry": shape(geom)})
        if not rows:
            return None
        gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")
        return gdf
    except Exception as exc:
        print(f"[enrichment] CLUE blocks failed: {exc}", file=sys.stderr)
        return None


def load_clue_block_uses() -> tuple[gpd.GeoDataFrame | None, dict[int, tuple[str, str]], str | None]:
    """
    Returns (blocks gdf with use columns, block_id->use map, error message).
    """
    floor = fetch_floor_space_table()
    if not floor:
        return None, {}, "CLUE floor-space-by-use-by-block returned no rows"
    blocks = fetch_clue_blocks_gdf()
    if blocks is None or blocks.empty:
        return None, {}, "CLUE blocks GeoJSON unavailable"
    blocks = blocks.copy()
    blocks["use"] = blocks["block_id"].map(lambda bid: floor.get(int(bid), (None, None))[0])
    blocks["dominant_column"] = blocks["block_id"].map(lambda bid: floor.get(int(bid), (None, None))[1])
    blocks = blocks[blocks["use"].notna()]
    if blocks.empty:
        return None, {}, "No CLUE blocks with floor-space use"
    return blocks, floor, None


def clue_use_for_buildings(buildings: gpd.GeoDataFrame, clue_blocks: gpd.GeoDataFrame) -> pd.Series:
    """Index-aligned series of (use, 'clue') or None per building row."""
    result = pd.Series([None] * len(buildings), index=buildings.index, dtype=object)
    if clue_blocks is None or clue_blocks.empty:
        return result
    joined = gpd.sjoin(
        buildings,
        clue_blocks[["block_id", "use", "geometry"]],
        how="inner",
        predicate="intersects",
    )
    if joined.empty:
        return result
    joined["_area"] = joined.geometry.area
    for bidx in joined.index.unique():
        part = joined.loc[[bidx]] if bidx in joined.index else joined[joined.index == bidx]
        row = part.sort_values("_area", ascending=False).iloc[0]
        if pd.notna(row.get("use")):
            result.loc[bidx] = (row["use"], "clue")
    return result
