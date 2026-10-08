"""Greater Melbourne (ABS ASGS 2021 GCCSA 2GMEL) and City of Melbourne sub-extent."""

from __future__ import annotations

from typing import TypedDict


class GeoBounds(TypedDict):
    west: float
    south: float
    east: float
    north: float


# ABS ASGS 2021 GCCSA 2GMEL (Greater Melbourne), WGS84 bbox from geo.abs.gov.au MapServer extent.
GREATER_MELBOURNE_GCCSA: GeoBounds = {
    "west": 144.333634,
    "south": -38.502988,
    "east": 145.878412,
    "north": -37.175099,
}

REGION_NAME = "Greater Melbourne (ABS ASGS 2021 GCCSA 2GMEL)"

# City of Melbourne municipal area — CLUE applies only inside this box (conservative rect).
CITY_OF_MELBOURNE: GeoBounds = {
    "west": 144.89,
    "south": -37.86,
    "east": 145.0,
    "north": -37.77,
}


def point_in_bounds(lon: float, lat: float, bounds: GeoBounds) -> bool:
    return bounds["west"] <= lon <= bounds["east"] and bounds["south"] <= lat <= bounds["north"]


def building_in_bounds(geom, bounds: GeoBounds) -> bool:
    pt = geom if geom.geom_type == "Point" else geom.representative_point()
    return point_in_bounds(float(pt.x), float(pt.y), bounds)
