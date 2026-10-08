#!/usr/bin/env python3
"""
Assign building use (Overture → CLUE → BCA → zone → unclassified) and optional ELVIS LiDAR height.
Input: GeoJSON FeatureCollection of Overture footprints with properties.
Output: GeoJSON for tippecanoe + manifest JSON.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests

from bca_join import bca_use_for_buildings, fetch_vicmap_addresses, load_bca_index
from clue_join import clue_use_for_buildings, load_clue_block_uses

METRO = {"west": 144.35, "south": -38.25, "east": 145.55, "north": -37.45}
COM_BOUNDS = {"west": 144.89, "south": -37.86, "east": 145.0, "north": -37.77}

ZONE_WFS = (
    "https://opendata.maps.vic.gov.au/geoserver/wfs?"
    "service=WFS&version=2.0.0&request=GetFeature&"
    "typeNames=open-data-platform:plan_zone&outputFormat=application/json&"
    "srsName=EPSG:4326&count=50000&"
    f"bbox={METRO['west']},{METRO['south']},{METRO['east']},{METRO['north']},CRS:84"
)

USE_MAP = {
    "residential": "residential",
    "commercial": "commercial",
    "retail": "retail",
    "industrial": "industrial",
    "civic": "civic",
    "recreation": "recreation",
    "mixed_use": "mixed_use",
}


def classify_overture(props: dict) -> tuple[str, str] | None:
    for key in ("subtype", "class", "use"):
        raw = props.get(key)
        if isinstance(raw, str) and raw.strip():
            use = USE_MAP.get(raw.strip().lower())
            if use:
                return use, "overture"
    tags = props.get("tags") or {}
    if isinstance(tags, dict):
        for key in ("building", "building:use"):
            raw = tags.get(key)
            if isinstance(raw, str):
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


def fetch_zones() -> gpd.GeoDataFrame | None:
    try:
        response = requests.get(ZONE_WFS, timeout=120, headers={"Accept": "application/json"})
        if response.status_code in (401, 403, 429):
            print(f"[enrichment] zones HTTP {response.status_code}", file=sys.stderr)
            return None
        response.raise_for_status()
        gdf = gpd.GeoDataFrame.from_features(response.json().get("features", []), crs="EPSG:4326")
        return gdf if not gdf.empty else None
    except Exception as exc:
        print(f"[enrichment] zones failed: {exc}", file=sys.stderr)
        return None


def zone_at(geom, zones: gpd.GeoDataFrame) -> str | None:
    pt = geom if geom.geom_type == "Point" else geom.representative_point()
    hits = zones[zones.contains(pt)]
    if hits.empty:
        return None
    row = hits.iloc[0]
    zc = row.get("zone_code") or row.get("ZONE_CODE")
    return zc.strip() if isinstance(zc, str) else None


LIDAR_NO_DATA_LINE = "LiDAR: no data, ELVIS not ordered"


def lidar_manifest() -> dict:
    """LiDAR height tier is wired in the app; no DSM/DTM bake (ELVIS order on hold)."""
    return {"status": "no_data", "detail": LIDAR_NO_DATA_LINE}


def assign_cascade(
    props: dict,
    geom,
    zones: gpd.GeoDataFrame | None,
    clue_pick: tuple[str, str] | None,
    bca_pick: tuple[str, str] | None,
) -> dict:
    use = "unclassified"
    use_source = "unclassified"
    zone_code = None

    overture = classify_overture(props)
    if overture:
        use, use_source = overture

    if clue_pick and _tier_beats(clue_pick[1], use_source):
        use, use_source = clue_pick

    if bca_pick and _tier_beats(bca_pick[1], use_source):
        use, use_source = bca_pick

    if zones is not None and not zones.empty:
        zone_code = zone_at(geom, zones)
        if zone_code and use_source == "unclassified":
            zu = zone_use(zone_code)
            if zu:
                use, use_source = zu, "zone"

    rank = {"overture": 5, "clue": 4, "bca": 3, "zone": 2, "unclassified": 1}
    if zone_code and use_source == "zone" and rank.get(use_source, 0) < rank["zone"]:
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


def _tier_beats(candidate: str, current: str) -> bool:
    rank = {"overture": 5, "clue": 4, "bca": 3, "zone": 2, "unclassified": 1}
    return rank.get(candidate, 0) >= rank.get(current, 0)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="Overture footprints GeoJSON")
    parser.add_argument("--output-geojson", type=Path, default=Path("pipeline/out/enrichment.geojson"))
    parser.add_argument("--manifest", type=Path, default=Path("public/building-enrichment-manifest.json"))
    parser.add_argument("--cache", type=Path, default=Path("pipeline/cache"))
    args = parser.parse_args()

    buildings = gpd.read_file(args.input)
    if buildings.crs is None:
        buildings = buildings.set_crs("EPSG:4326")
    else:
        buildings = buildings.to_crs("EPSG:4326")

    zones = fetch_zones()
    clue_blocks, _floor_map, clue_err = load_clue_block_uses()
    clue_series = (
        clue_use_for_buildings(buildings, clue_blocks) if clue_blocks is not None and not clue_blocks.empty else pd.Series([None] * len(buildings), index=buildings.index)
    )

    bca_index, bca_meta = load_bca_index(args.cache, METRO)
    addresses = fetch_vicmap_addresses(METRO)
    bca_series = bca_use_for_buildings(buildings, addresses, bca_index)

    lidar = lidar_manifest()
    print(f"[enrichment] {LIDAR_NO_DATA_LINE}", file=sys.stderr)

    source_counts = {"overture": 0, "clue": 0, "bca": 0, "zone": 0, "unclassified": 0}
    features = []
    for idx, row in buildings.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        props = {k: v for k, v in dict(row).items() if k != "geometry"}
        enriched = assign_cascade(
            props,
            geom,
            zones,
            clue_series.loc[idx] if idx in clue_series.index else None,
            bca_series.loc[idx] if idx in bca_series.index else None,
        )
        oid = enriched.get("overture_id")
        if not oid:
            continue
        tier = enriched.get("use_source", "unclassified")
        if tier in source_counts:
            source_counts[tier] += 1
        features.append(
            {
                "type": "Feature",
                "properties": enriched,
                "geometry": geom.__geo_interface__,
            }
        )

    args.output_geojson.parent.mkdir(parents=True, exist_ok=True)
    args.output_geojson.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}),
        encoding="utf-8",
    )

    manifest = {
        "extent": METRO,
        "featureCount": len(features),
        "pmtilesBytes": 0,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "lidar": lidar,
        "zonesLoaded": zones is not None and not zones.empty,
        "clueLoaded": clue_blocks is not None and not clue_blocks.empty,
        "clueError": clue_err,
        "clueBlocks": int(len(clue_blocks)) if clue_blocks is not None else 0,
        "bca": bca_meta,
        "useSourceCountsSample": source_counts,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(features)} enrichment features → {args.output_geojson}")
    print(f"use_source sample counts: {source_counts}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
