#!/usr/bin/env python3
"""
Assign building use (Overture → CLUE (CoM only) → BCA → zone → unclassified) and optional ELVIS LiDAR height.
Input: GeoJSON or GeoParquet of Overture footprints.
Output: GeoJSON for tippecanoe + manifest JSON.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd

from bca_join import bca_use_for_buildings, fetch_vicmap_addresses, load_bca_index
from clue_join import clue_use_for_buildings, load_clue_block_uses
from extent import CITY_OF_MELBOURNE, GREATER_MELBOURNE_GCCSA, REGION_NAME, building_in_bounds
from zones_fetch import fetch_zones_for_bounds

USE_MAP = {
    "residential": "residential",
    "commercial": "commercial",
    "retail": "retail",
    "industrial": "industrial",
    "civic": "civic",
    "recreation": "recreation",
    "mixed_use": "mixed_use",
}

USE_CODE = {
    "unclassified": 0,
    "residential": 1,
    "commercial": 2,
    "retail": 3,
    "mixed_use": 4,
    "industrial": 5,
    "civic": 6,
    "recreation": 7,
    "outbuilding": 8,
}

SOURCE_CODE = {
    "unclassified": 0,
    "overture": 1,
    "clue": 2,
    "bca": 3,
    "zone": 4,
}

TIER_RANK = {"overture": 5, "clue": 4, "bca": 3, "zone": 2, "unclassified": 1}


def classify_overture_row(row: pd.Series) -> tuple[str, str] | None:
    for key in ("subtype", "class", "use"):
        raw = row.get(key)
        if isinstance(raw, str) and raw.strip():
            use = USE_MAP.get(raw.strip().lower())
            if use:
                return use, "overture"
    return None


def zone_use(code: str) -> str | None:
    code = code.strip().upper()
    if code.startswith("GRZ") or code.startswith("NRZ") or code.startswith("RGZ"):
        return "residential"
    if code.startswith("MUZ"):
        return "mixed_use"
    if code.startswith("C"):
        return "commercial"
    if code.startswith("IN"):
        return "industrial"
    if code.startswith("PUZ"):
        return "civic"
    return None


LIDAR_NO_DATA_LINE = "LiDAR: no data, ELVIS not ordered"


def lidar_manifest() -> dict:
    return {"status": "no_data", "detail": LIDAR_NO_DATA_LINE}


def _tier_beats(candidate: str, current: str) -> bool:
    return TIER_RANK.get(candidate, 0) >= TIER_RANK.get(current, 0)


def load_buildings(path: Path) -> gpd.GeoDataFrame:
    if path.suffix.lower() == ".parquet":
        gdf = gpd.read_parquet(path)
        if "geom" in gdf.columns and "geometry" not in gdf.columns:
            gdf = gdf.set_geometry("geom")
    else:
        gdf = gpd.read_file(path)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")
    return gdf


def join_zones(buildings: gpd.GeoDataFrame, zones: gpd.GeoDataFrame | None) -> pd.Series:
    """Representative-point zone_code per building (may be null)."""
    out = pd.Series([None] * len(buildings), index=buildings.index, dtype=object)
    if zones is None or zones.empty:
        return out
    pts = buildings.copy()
    pts["geometry"] = pts.geometry.representative_point()
    joined = gpd.sjoin(pts, zones, how="left", predicate="within")
    zcol = "zone_code" if "zone_code" in joined.columns else "ZONE_CODE"
    for idx in joined.index.unique():
        part = joined.loc[[idx]] if idx in joined.index else joined[joined.index == idx]
        row = part.iloc[0]
        zc = row.get(zcol)
        if isinstance(zc, str) and zc.strip():
            out.loc[idx] = zc.strip()
    return out


def apply_cascade_vectorized(
    buildings: gpd.GeoDataFrame,
    zone_codes: pd.Series,
    clue_series: pd.Series,
    bca_series: pd.Series,
) -> pd.DataFrame:
    n = len(buildings)
    use = pd.Series(["unclassified"] * n, index=buildings.index)
    use_source = pd.Series(["unclassified"] * n, index=buildings.index)

    overture_hits = buildings.apply(classify_overture_row, axis=1)
    for idx, hit in overture_hits.items():
        if hit:
            use.loc[idx], use_source.loc[idx] = hit

    for idx in buildings.index:
        clue_pick = clue_series.loc[idx] if idx in clue_series.index else None
        if clue_pick and _tier_beats(clue_pick[1], use_source.loc[idx]):
            use.loc[idx], use_source.loc[idx] = clue_pick
        bca_pick = bca_series.loc[idx] if idx in bca_series.index else None
        if bca_pick and _tier_beats(bca_pick[1], use_source.loc[idx]):
            use.loc[idx], use_source.loc[idx] = bca_pick
        zc = zone_codes.loc[idx] if idx in zone_codes.index else None
        if zc and use_source.loc[idx] == "unclassified":
            zu = zone_use(str(zc))
            if zu:
                use.loc[idx], use_source.loc[idx] = zu, "zone"

    return pd.DataFrame({"use": use, "use_source": use_source, "zone_code": zone_codes})


def count_sources_by_com(
    buildings: gpd.GeoDataFrame,
    use_source: pd.Series,
) -> dict[str, dict[str, int]]:
    inside = {"overture": 0, "clue": 0, "bca": 0, "zone": 0, "unclassified": 0}
    outside = dict(inside)
    for idx, tier in use_source.items():
        geom = buildings.geometry.loc[idx]
        if geom is None or geom.is_empty:
            continue
        bucket = inside if building_in_bounds(geom, CITY_OF_MELBOURNE) else outside
        key = tier if tier in bucket else "unclassified"
        bucket[key] += 1
    return {"insideCityOfMelbourne": inside, "outsideCityOfMelbourne": outside}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="Overture footprints GeoJSON or Parquet")
    parser.add_argument("--output-geojson", type=Path, default=Path("pipeline/out/enrichment.geojson"))
    parser.add_argument("--manifest", type=Path, default=Path("public/building-enrichment-manifest.json"))
    parser.add_argument("--cache", type=Path, default=Path("pipeline/cache"))
    parser.add_argument("--extent-json", type=str, default="", help="JSON bounds for manifest extent")
    args = parser.parse_args()

    timings: dict[str, float] = {}
    t_all = time.perf_counter()

    t0 = time.perf_counter()
    buildings = load_buildings(args.input)
    timings["loadBuildingsSec"] = round(time.perf_counter() - t0, 2)

    extent = GREATER_MELBOURNE_GCCSA
    if args.extent_json:
        raw = json.loads(args.extent_json)
        extent = {k: float(raw[k]) for k in ("west", "south", "east", "north")}

    t0 = time.perf_counter()
    zones = fetch_zones_for_bounds(extent)
    timings["fetchZonesSec"] = round(time.perf_counter() - t0, 2)

    t0 = time.perf_counter()
    clue_blocks, _floor_map, clue_err = load_clue_block_uses()
    timings["loadClueSec"] = round(time.perf_counter() - t0, 2)

    com_mask = buildings.geometry.apply(lambda g: building_in_bounds(g, CITY_OF_MELBOURNE) if g is not None else False)
    com_buildings = buildings.loc[com_mask]
    t0 = time.perf_counter()
    clue_full = pd.Series([None] * len(buildings), index=buildings.index, dtype=object)
    if clue_blocks is not None and not clue_blocks.empty and not com_buildings.empty:
        clue_com = clue_use_for_buildings(com_buildings, clue_blocks)
        clue_full.loc[clue_com.index] = clue_com
    timings["clueJoinSec"] = round(time.perf_counter() - t0, 2)

    t0 = time.perf_counter()
    bca_index, bca_meta = load_bca_index(args.cache, extent)
    addresses = fetch_vicmap_addresses(extent)
    bca_series = bca_use_for_buildings(buildings, addresses, bca_index)
    timings["bcaJoinSec"] = round(time.perf_counter() - t0, 2)

    t0 = time.perf_counter()
    zone_codes = join_zones(buildings, zones)
    assigned = apply_cascade_vectorized(buildings, zone_codes, clue_full, bca_series)
    timings["cascadeSec"] = round(time.perf_counter() - t0, 2)

    lidar = lidar_manifest()
    print(f"[enrichment] {LIDAR_NO_DATA_LINE}", file=sys.stderr)

    source_counts = assigned["use_source"].value_counts().to_dict()
    for key in ("overture", "clue", "bca", "zone", "unclassified"):
        source_counts.setdefault(key, 0)

    by_com = count_sources_by_com(buildings, assigned["use_source"])

    t0 = time.perf_counter()
    features = []
    for idx, row in buildings.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        props_row = assigned.loc[idx]
        oid = row.get("overture_id") or row.get("id")
        if oid is None or (isinstance(oid, float) and pd.isna(oid)):
            continue
        oid = str(oid)
        use = str(props_row["use"])
        src = str(props_row["use_source"])
        zc = props_row.get("zone_code")
        enriched = {
            "overture_id": oid,
            "use": use,
            "use_source": src,
            "u": USE_CODE.get(use, 0),
            "s": SOURCE_CODE.get(src, 0),
            "zone_code": zc if isinstance(zc, str) and zc else None,
            "height_m": None,
            "height_source": None,
        }
        features.append(
            {
                "type": "Feature",
                "properties": enriched,
                "geometry": geom.__geo_interface__,
            }
        )
    timings["writeFeaturesSec"] = round(time.perf_counter() - t0, 2)
    timings["totalSec"] = round(time.perf_counter() - t_all, 2)

    args.output_geojson.parent.mkdir(parents=True, exist_ok=True)
    args.output_geojson.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}),
        encoding="utf-8",
    )

    manifest = {
        "extent": extent,
        "regionName": REGION_NAME,
        "featureCount": len(features),
        "pmtilesBytes": 0,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "lidar": lidar,
        "zonesLoaded": zones is not None and not zones.empty,
        "clueLoaded": clue_blocks is not None and not clue_blocks.empty,
        "clueError": clue_err,
        "clueBlocks": int(len(clue_blocks)) if clue_blocks is not None else 0,
        "clueAppliesWithin": CITY_OF_MELBOURNE,
        "bca": bca_meta,
        "useSourceCountsSample": {k: source_counts.get(k, 0) for k in ("overture", "clue", "bca", "zone", "unclassified")},
        "useSourceCountsByCom": by_com,
        "pipelineTimingsSec": timings,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(features)} enrichment features → {args.output_geojson}")
    print(f"use_source counts: {source_counts}", file=sys.stderr)
    print(f"timings: {timings}", file=sys.stderr)
    return 0


# Re-export for tests
def assign_cascade(props, geom, zones, clue_pick, bca_pick):
    """Single-building cascade (used by unit tests)."""
    use = "unclassified"
    use_source = "unclassified"
    zone_code = None

    row = pd.Series(props)
    overture = classify_overture_row(row)
    if overture:
        use, use_source = overture

    if clue_pick and _tier_beats(clue_pick[1], use_source):
        use, use_source = clue_pick

    if bca_pick and _tier_beats(bca_pick[1], use_source):
        use, use_source = bca_pick

    if zones is not None and not zones.empty:
        pt = geom if geom.geom_type == "Point" else geom.representative_point()
        hits = zones[zones.contains(pt)]
        if not hits.empty:
            zrow = hits.iloc[0]
            zc = zrow.get("zone_code") or zrow.get("ZONE_CODE")
            if isinstance(zc, str):
                zone_code = zc.strip()
                if use_source == "unclassified":
                    zu = zone_use(zone_code)
                    if zu:
                        use, use_source = zu, "zone"

    return {
        "use": use,
        "use_source": use_source,
        "zone_code": zone_code,
        "height_m": None,
        "height_source": None,
        "overture_id": props.get("overture_id") or props.get("id"),
    }


def classify_overture(props: dict) -> tuple[str, str] | None:
    return classify_overture_row(pd.Series(props))


if __name__ == "__main__":
    raise SystemExit(main())
