"""Greater Melbourne (ABS ASGS 2021 GCCSA 2GMEL) and City of Melbourne LGA."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import TypedDict

import geopandas as gpd
from shapely.geometry import Point

LGA_PATH = Path(__file__).resolve().parent / "data" / "com-lga-2021.geojson"
LGA_NAME = "City of Melbourne (ABS ASGS 2021 LGA 24600)"


class GeoBounds(TypedDict):
    west: float
    south: float
    east: float
    north: float


GREATER_MELBOURNE_GCCSA: GeoBounds = {
    "west": 144.333634,
    "south": -38.502988,
    "east": 145.878412,
    "north": -37.175099,
}

REGION_NAME = "Greater Melbourne (ABS ASGS 2021 GCCSA 2GMEL)"

# Legacy CLUE gate (superseded by LGA polygon); kept for regression tests.
CITY_OF_MELBOURNE_RECT: GeoBounds = {
    "west": 144.89,
    "south": -37.86,
    "east": 145.0,
    "north": -37.77,
}

CITY_OF_MELBOURNE = CITY_OF_MELBOURNE_RECT


@lru_cache(maxsize=1)
def city_of_melbourne_lga() -> gpd.GeoDataFrame:
    gdf = gpd.read_file(LGA_PATH)
    if gdf.crs is None:
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")
    return gdf


def point_in_city_of_melbourne(lon: float, lat: float) -> bool:
    pt = Point(lon, lat)
    lga = city_of_melbourne_lga()
    return bool(lga.contains(pt).any())


def building_in_city_of_melbourne(geom) -> bool:
    pt = geom if geom.geom_type == "Point" else geom.representative_point()
    return point_in_city_of_melbourne(float(pt.x), float(pt.y))


def point_in_bounds(lon: float, lat: float, bounds: GeoBounds) -> bool:
    return bounds["west"] <= lon <= bounds["east"] and bounds["south"] <= lat <= bounds["north"]


def building_in_bounds(geom, bounds: GeoBounds) -> bool:
    pt = geom if geom.geom_type == "Point" else geom.representative_point()
    return point_in_bounds(float(pt.x), float(pt.y), bounds)
