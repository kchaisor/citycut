"""Paged Vicmap planning zone WFS fetch for large bboxes."""

from __future__ import annotations

import sys
import time
from dataclasses import dataclass, field
from typing import Any

import geopandas as gpd
import pandas as pd
import requests

from extent import GeoBounds

ZONE_LAYER = "open-data-platform:plan_zone"
WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs"
PAGE = 5000
MAX_RETRIES = 4


@dataclass
class ZoneFetchStats:
    cells: int = 0
    pages_ok: int = 0
    pages_failed: int = 0
    features: int = 0
    retries: int = 0
    failures: list[str] = field(default_factory=list)

    def to_manifest(self) -> dict[str, Any]:
        return {
            "cells": self.cells,
            "pagesOk": self.pages_ok,
            "pagesFailed": self.pages_failed,
            "features": self.features,
            "retries": self.retries,
            "complete": self.pages_failed == 0 and len(self.failures) == 0,
            "failures": self.failures[:50],
        }


def _fetch_page(bbox: str, start: int) -> list[dict[str, Any]]:
    url = (
        f"{WFS}?service=WFS&version=2.0.0&request=GetFeature"
        f"&typeNames={ZONE_LAYER}&outputFormat=application/json"
        f"&srsName=EPSG:4326&count={PAGE}&startIndex={start}&bbox={bbox}"
    )
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, timeout=120, headers={"Accept": "application/json"})
            if response.status_code in (401, 403, 429):
                raise RuntimeError(f"zones HTTP {response.status_code}")
            response.raise_for_status()
            return response.json().get("features") or []
        except Exception as exc:
            last_exc = exc
            if attempt + 1 < MAX_RETRIES:
                time.sleep(2**attempt)
    raise last_exc or RuntimeError("zones fetch failed")


def fetch_zones_for_bounds(
    bounds: GeoBounds,
    cell_deg: float = 0.25,
    *,
    strict: bool = False,
) -> tuple[gpd.GeoDataFrame | None, ZoneFetchStats]:
    """Tile the bbox and page WFS so we stay under feature limits."""
    stats = ZoneFetchStats()
    frames: list[gpd.GeoDataFrame] = []
    west, south, east, north = bounds["west"], bounds["south"], bounds["east"], bounds["north"]
    lon = west
    while lon < east:
        lon2 = min(lon + cell_deg, east)
        lat = south
        while lat < north:
            lat2 = min(lat + cell_deg, north)
            stats.cells += 1
            bbox = f"{lon},{lat},{lon2},{lat2},CRS:84"
            start = 0
            while True:
                try:
                    feats = _fetch_page(bbox, start)
                    stats.pages_ok += 1
                except Exception as exc:
                    stats.pages_failed += 1
                    msg = f"cell {bbox} startIndex={start}: {exc}"
                    stats.failures.append(msg)
                    print(f"[enrichment] zones FAILED {msg}", file=sys.stderr)
                    if strict:
                        raise
                    feats = []
                    break
                if not feats:
                    break
                gdf = gpd.GeoDataFrame.from_features(feats, crs="EPSG:4326")
                if not gdf.empty:
                    frames.append(gdf)
                    stats.features += len(gdf)
                if len(feats) < PAGE:
                    break
                start += PAGE
            lat = lat2
        lon = lon2
    if not frames:
        return None, stats
    merged = pd.concat(frames, ignore_index=True)
    if "zone_code" not in merged.columns and "ZONE_CODE" in merged.columns:
        merged["zone_code"] = merged["ZONE_CODE"]
    merged = merged.drop_duplicates(subset=[c for c in ("zone_code", "geometry") if c in merged.columns])
    return gpd.GeoDataFrame(merged, crs="EPSG:4326"), stats
