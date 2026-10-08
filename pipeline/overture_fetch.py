#!/usr/bin/env python3
"""Load Overture building footprints for a bbox from GeoParquet on S3 (DuckDB spatial)."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import duckdb

from extent import GREATER_MELBOURNE_GCCSA, GeoBounds


def fetch_buildings_parquet(
    bounds: GeoBounds,
    release: str,
    dest: Path,
) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_region='us-west-2';")
    w, s, e, n = bounds["west"], bounds["south"], bounds["east"], bounds["north"]
    glob_path = f"s3://overturemaps-us-west-2/release/{release}/theme=buildings/type=building/*"
    t0 = time.perf_counter()
    con.execute(
        f"""
        COPY (
          SELECT
            id AS overture_id,
            id,
            class,
            subtype,
            height,
            num_floors,
            geometry AS geom
          FROM read_parquet('{glob_path}', filename=true, hive_partitioning=true)
          WHERE bbox.xmax >= {w} AND bbox.xmin <= {e}
            AND bbox.ymax >= {s} AND bbox.ymin <= {n}
            AND id IS NOT NULL
        ) TO '{dest.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    count = con.execute(f"SELECT count(*) FROM read_parquet('{dest.as_posix()}')").fetchone()[0]
    print(f"[overture] {count} buildings → {dest} ({time.perf_counter() - t0:.1f}s)", file=sys.stderr)
    return int(count)


def parquet_to_geojson(parquet_path: Path, geojson_path: Path, limit: int | None = None) -> int:
    import geopandas as gpd

    gdf = gpd.read_parquet(parquet_path)
    if limit is not None:
        gdf = gdf.head(limit)
    gdf = gdf.set_geometry("geom")
    gdf = gdf.set_crs("EPSG:4326")
    rename = {"geom": "geometry"}
    gdf = gdf.rename(columns=rename)
    geojson_path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(geojson_path, driver="GeoJSON")
    return len(gdf)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--release", default="2026-09-23.1")
    parser.add_argument("--parquet", type=Path, default=Path("pipeline/out/overture-input.parquet"))
    parser.add_argument("--geojson", type=Path, default=Path("pipeline/out/overture-input.geojson"))
    parser.add_argument("--bounds-json", type=str, default="")
    parser.add_argument("--geojson-only", action="store_true")
    parser.add_argument("--parquet-only", action="store_true", help="Skip GeoJSON export (large metro builds)")
    args = parser.parse_args()

    bounds: GeoBounds = GREATER_MELBOURNE_GCCSA
    if args.bounds_json:
        raw = json.loads(args.bounds_json)
        bounds = GeoBounds(west=raw["west"], south=raw["south"], east=raw["east"], north=raw["north"])

    if not args.geojson_only:
        fetch_buildings_parquet(bounds, args.release, args.parquet)
    if not args.parquet_only:
        parquet_to_geojson(args.parquet, args.geojson)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
