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
import requests
from shapely.geometry import shape

METRO = {"west": 144.35, "south": -38.25, "east": 145.55, "north": -37.45}

ZONE_WFS = (
    "https://opendata.maps.vic.gov.au/geoserver/wfs?"
    "service=WFS&version=2.0.0&request=GetFeature&"
    "typeNames=open-data-platform:plan_zone&outputFormat=application/json&"
    "srsName=EPSG:4326&count=50000&"
    f"bbox={METRO['west']},{METRO['south']},{METRO['east']},{METRO['north']},CRS:84"
)

CLUE_URL = (
    "https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/"
    "census-of-land-use-and-employment-clue/buildings/exports/geojson"
)

BCA_URL = (
    "https://discover.data.vic.gov.au/api/3/action/datastore_search?"
    "resource_id=8a7325e9-8c4c-4b5e-9f6e-8c8e8c8e8c8e&limit=0"
)

USE_MAP = {
    "residential": "residential",
    "commercial": "commercial",
    "retail": "retail",
    "industrial": "industrial",
    "civic": "civic",
    "recreation": "recreation",
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
    if code.startswith("GRZ"):
        return "residential"
    if code.startswith("NRZ"):
        return "residential"
    if code.startswith("RGZ"):
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
        data = response.json()
        gdf = gpd.GeoDataFrame.from_features(data.get("features", []), crs="EPSG:4326")
        if gdf.empty:
            return None
        return gdf
    except Exception as exc:
        print(f"[enrichment] zones failed: {exc}", file=sys.stderr)
        return None


def fetch_clue() -> gpd.GeoDataFrame | None:
    try:
        response = requests.get(CLUE_URL, timeout=180, allow_redirects=True)
        if response.status_code in (401, 403, 429):
            print(f"[enrichment] CLUE HTTP {response.status_code}", file=sys.stderr)
            return None
        if response.status_code >= 400:
            print(f"[enrichment] CLUE HTTP {response.status_code}", file=sys.stderr)
            return None
        gdf = gpd.read_file(response.text)
        if gdf.crs is None:
            gdf.set_crs("EPSG:4326", inplace=True)
        return gdf.to_crs("EPSG:4326")
    except Exception as exc:
        print(f"[enrichment] CLUE skipped: {exc}", file=sys.stderr)
        return None


def probe_elvis() -> dict:
    url = "https://api.elevation.fsdf.org.au/api/v1/collections"
    try:
        response = requests.head(url, timeout=30)
        if response.status_code in (401, 403, 429):
            return {
                "status": "blocked",
                "detail": f"ELVIS API returned HTTP {response.status_code}. "
                "Order Greater Melbourne LiDAR 2017–18 via elevation.fsdf.org.au (email delivery) "
                "and place DSM/DTM GeoTIFFs under pipeline/cache/elvis/ for the lidar step.",
            }
        return {"status": "not_implemented", "detail": "LiDAR height bake requires local DSM/DTM tiles."}
    except Exception as exc:
        return {"status": "unreachable", "detail": str(exc)}


def assign_row(props: dict, zones: gpd.GeoDataFrame | None, clue: gpd.GeoDataFrame | None, geom) -> dict:
    overture = classify_overture(props)
    use = "unclassified"
    use_source = "unclassified"
    zone_code = None
    if overture:
        use, use_source = overture
    if zones is not None and not zones.empty:
        try:
            pt = geom if geom.geom_type == "Point" else geom.representative_point()
            hits = zones[zones.contains(pt)]
            if not hits.empty:
                row = hits.iloc[0]
                zc = row.get("zone_code") or row.get("ZONE_CODE")
                if isinstance(zc, str):
                    zone_code = zc.strip()
                    if use_source == "unclassified":
                        zu = zone_use(zone_code)
                        if zu:
                            use, use_source = zu, "zone"
        except Exception:
            pass
    if clue is not None and not clue.empty and use_source in ("unclassified", "zone"):
        try:
            pt = geom if geom.geom_type == "Point" else geom.representative_point()
            hits = clue[clue.contains(pt)]
            if not hits.empty:
                space = hits.iloc[0].get("clue_space_use") or hits.iloc[0].get("SPACE_USE")
                if isinstance(space, str):
                    key = space.strip().lower().replace(" ", "_")
                    if key in USE_MAP.values() or key == "mixed_use":
                        use, use_source = key, "clue"
        except Exception:
            pass
    height_m = None
    height_source = None
    return {
        "use": use,
        "use_source": use_source,
        "zone_code": zone_code,
        "height_m": height_m,
        "height_source": height_source,
        "overture_id": props.get("overture_id") or props.get("id"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="Overture footprints GeoJSON")
    parser.add_argument("--output-geojson", type=Path, default=Path("pipeline/out/enrichment.geojson"))
    parser.add_argument("--manifest", type=Path, default=Path("public/building-enrichment-manifest.json"))
    args = parser.parse_args()

    buildings = gpd.read_file(args.input)
    if buildings.crs is None:
        buildings = buildings.set_crs("EPSG:4326")
    else:
        buildings = buildings.to_crs("EPSG:4326")

    zones = fetch_zones()
    clue = fetch_clue()
    lidar = probe_elvis()

    features = []
    for _, row in buildings.iterrows():
        props = dict(row)
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        base = {k: v for k, v in props.items() if k != "geometry"}
        enriched = assign_row(base, zones, clue, geom)
        oid = enriched.get("overture_id")
        if not oid:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": enriched,
                "geometry": geom.__geo_interface__,
            }
        )

    args.output_geojson.parent.mkdir(parents=True, exist_ok=True)
    out = {"type": "FeatureCollection", "features": features}
    args.output_geojson.write_text(json.dumps(out), encoding="utf-8")

    manifest = {
        "extent": METRO,
        "featureCount": len(features),
        "pmtilesBytes": 0,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "lidar": lidar,
        "zonesLoaded": zones is not None and not zones.empty,
        "clueLoaded": clue is not None and not clue.empty,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {len(features)} enrichment features → {args.output_geojson}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
