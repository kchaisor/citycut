#!/usr/bin/env python3
"""
Assign building use (Overture → CLUE (CoM only) → BCA → zone → unclassified) and optional ELVIS LiDAR height.
Input: GeoJSON or GeoParquet of Overture footprints.
Output: GeoJSON for tippecanoe + manifest JSON.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import pandas as pd

from bca_join import bca_use_for_buildings, fetch_vicmap_addresses, load_bca_index
from clue_join import clue_use_for_buildings, load_clue_block_uses
from extent import (
    GREATER_MELBOURNE_GCCSA,
    LGA_NAME,
    REGION_NAME,
    building_in_city_of_melbourne,
)
from zone_use import (
    C1Z_RETAIL_BELOW_M,
    ZONE_USE,
    resolved_height_m,
    strip_schedule_suffix,
    use_from_zone_row,
)
from overture_tag_classify import OSM_BUILDING_USE, classify_overture_row
from table_hash import enrichment_table_hashes
from zones_fetch import fetch_zones_for_bounds

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


LIDAR_NO_DATA_LINE = "LiDAR: no data, ELVIS not ordered"


def lidar_manifest() -> dict:
    return {"status": "no_data", "detail": LIDAR_NO_DATA_LINE}


def _tier_beats(candidate: str, current: str) -> bool:
    return TIER_RANK.get(candidate, 0) > TIER_RANK.get(current, 0)


def load_buildings(path: Path) -> gpd.GeoDataFrame:
    if path.suffix.lower() == ".parquet":
        gdf = gpd.read_parquet(path)
        geom_col = "geometry" if "geometry" in gdf.columns else "geom" if "geom" in gdf.columns else None
        if geom_col is None:
            raise ValueError(f"No geometry column in {path}")
        gdf = gdf.set_geometry(geom_col)
        if geom_col != "geometry":
            gdf = gdf.rename_geometry("geometry")
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
    pts = buildings[["geometry"]].copy()
    pts["geometry"] = pts.geometry.representative_point()
    zcol = "zone_code" if "zone_code" in zones.columns else "ZONE_CODE"
    zsubset = zones[[zcol, "geometry"]].rename(columns={zcol: "zone_code"})
    joined = gpd.sjoin(pts, zsubset, how="left", predicate="intersects")
    joined = joined[~joined.index.duplicated(keep="first")]
    codes = joined["zone_code"].astype("string").str.strip()
    out.loc[joined.index] = codes.where(codes.notna() & (codes != ""))
    return out


def _vector_overture_use(buildings: gpd.GeoDataFrame) -> tuple[pd.Series, pd.Series]:
    """One `classify_overture_row` per footprint (combined class/subtype/use tags)."""
    picks = buildings.apply(classify_overture_row, axis=1)
    use = picks.map(lambda p: p[0] if p else "unclassified").astype("string")
    source = picks.map(lambda p: p[1] if p else "unclassified").astype("string")
    return use, source


def _apply_tier_series(
    use: pd.Series,
    use_source: pd.Series,
    picks: pd.Series,
    tier_name: str,
) -> tuple[pd.Series, pd.Series]:
    """Apply (use, tier) tuples from picks where tier rank beats current."""
    rank = use_source.map(lambda t: TIER_RANK.get(str(t), 0))
    cand_rank = TIER_RANK[tier_name]
    mask = picks.notna() & (cand_rank > rank)
    if not mask.any():
        return use, use_source
    uses = picks[mask].map(lambda t: t[0])
    use = use.where(~mask, uses)
    use_source = use_source.where(~mask, tier_name)
    return use, use_source


def apply_cascade_vectorized(
    buildings: gpd.GeoDataFrame,
    zone_codes: pd.Series,
    clue_series: pd.Series,
    bca_series: pd.Series,
) -> pd.DataFrame:
    use, use_source = _vector_overture_use(buildings)
    use, use_source = _apply_tier_series(use, use_source, clue_series, "clue")
    use, use_source = _apply_tier_series(use, use_source, bca_series, "bca")

    zone_mask = (use_source == "unclassified") & zone_codes.notna()
    if zone_mask.any():
        sub_idx = buildings.index[zone_mask]
        stripped = zone_codes.loc[sub_idx].astype(str).map(strip_schedule_suffix)
        heights = buildings.loc[sub_idx].apply(
            lambda r: resolved_height_m(r.get("height"), r.get("num_floors")),
            axis=1,
        )
        zuses = stripped.map(lambda s: ZONE_USE.get(s))
        c1z = stripped == "C1Z"
        if c1z.any():
            zuses.loc[c1z] = heights.loc[c1z].map(
                lambda h: "retail" if h < C1Z_RETAIL_BELOW_M else "commercial"
            )
        hit = zuses.notna()
        use.loc[sub_idx[hit]] = zuses[hit].values
        use_source.loc[sub_idx[hit]] = "zone"

    return pd.DataFrame({"use": use, "use_source": use_source, "zone_code": zone_codes})


def zone_diagnostics(
    buildings: gpd.GeoDataFrame,
    zone_codes: pd.Series,
    assigned: pd.DataFrame,
) -> dict[str, object]:
    unclassified = assigned["use_source"] == "unclassified"
    zc = zone_codes.astype("string")
    missing = unclassified & (zc.isna() | (zc.str.strip() == ""))
    with_zone = unclassified & ~missing
    stripped = zc.loc[with_zone.index].dropna().astype(str).map(strip_schedule_suffix)
    unmapped_mask = ~stripped.map(lambda s: s == "C1Z" or s in ZONE_USE)
    counts = Counter(stripped[unmapped_mask].value_counts().to_dict())
    return {
        "unclassifiedNoZoneJoin": int(missing.sum()),
        "unclassifiedUnmappedZoneCounts": dict(counts.most_common(40)),
    }


def count_sources_by_com(
    buildings: gpd.GeoDataFrame,
    use_source: pd.Series,
    com_mask: pd.Series,
) -> dict[str, dict[str, int]]:
    inside = {"overture": 0, "clue": 0, "bca": 0, "zone": 0, "unclassified": 0}
    outside = dict(inside)
    tiers = use_source.fillna("unclassified")
    for tier, in_com in zip(tiers, com_mask, strict=False):
        key = tier if tier in inside else "unclassified"
        if in_com:
            inside[key] += 1
        else:
            outside[key] += 1
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

    strict_zones = os.environ.get("STRICT_ZONES_FETCH", "1") == "1"
    t0 = time.perf_counter()
    zones, zone_fetch_stats = fetch_zones_for_bounds(extent, strict=strict_zones)
    timings["fetchZonesSec"] = round(time.perf_counter() - t0, 2)
    print(f"[enrichment] zones WFS: {zone_fetch_stats.to_manifest()}", file=sys.stderr)
    if not zone_fetch_stats.to_manifest()["complete"]:
        print("[enrichment] zones WFS incomplete — manifest will flag; unclassified may be inflated", file=sys.stderr)
        if strict_zones and zone_fetch_stats.pages_failed > 0:
            return 1

    t0 = time.perf_counter()
    clue_blocks, _floor_map, clue_err = load_clue_block_uses()
    timings["loadClueSec"] = round(time.perf_counter() - t0, 2)

    com_mask = buildings.geometry.apply(
        lambda g: building_in_city_of_melbourne(g) if g is not None and not g.is_empty else False
    )
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

    by_com = count_sources_by_com(buildings, assigned["use_source"], com_mask)
    zone_diag = zone_diagnostics(buildings, zone_codes, assigned)

    t0 = time.perf_counter()
    out = buildings.copy()
    out["use"] = assigned["use"].values
    out["use_source"] = assigned["use_source"].values
    out["zone_code"] = assigned["zone_code"].values
    out["u"] = out["use"].map(lambda u: USE_CODE.get(str(u), 0))
    out["s"] = out["use_source"].map(lambda s: SOURCE_CODE.get(str(s), 0))
    out["height_m"] = None
    out["height_source"] = None
    oid = out.get("overture_id")
    if oid is None:
        out["overture_id"] = out.get("id")
    out = out[out["overture_id"].notna()]
    out = out[~out.geometry.is_empty]
    keep_cols = [
        "overture_id",
        "use",
        "use_source",
        "u",
        "s",
        "zone_code",
        "height_m",
        "height_source",
        "geometry",
    ]
    out = out[[c for c in keep_cols if c in out.columns]]
    args.output_geojson.parent.mkdir(parents=True, exist_ok=True)
    out.to_file(args.output_geojson, driver="GeoJSON")
    features_count = len(out)
    timings["writeFeaturesSec"] = round(time.perf_counter() - t0, 2)
    timings["totalSec"] = round(time.perf_counter() - t_all, 2)

    table_hashes = enrichment_table_hashes()
    manifest = {
        "extent": extent,
        "regionName": REGION_NAME,
        **table_hashes,
        "featureCount": features_count,
        "pmtilesBytes": 0,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "lidar": lidar,
        "zonesLoaded": zones is not None and not zones.empty,
        "zonesFetch": zone_fetch_stats.to_manifest(),
        "zoneDiagnostics": zone_diag,
        "clueLoaded": clue_blocks is not None and not clue_blocks.empty,
        "clueError": clue_err,
        "clueBlocks": int(len(clue_blocks)) if clue_blocks is not None else 0,
        "clueAppliesWithinLga": LGA_NAME,
        "clueAppliesLgaCode": "24600",
        "bca": bca_meta,
        "useSourceCountsSample": {k: source_counts.get(k, 0) for k in ("overture", "clue", "bca", "zone", "unclassified")},
        "useSourceCountsByCom": by_com,
        "pipelineTimingsSec": timings,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {features_count} enrichment features → {args.output_geojson}")
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
                    zu = use_from_zone_row(zone_code, row)
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
