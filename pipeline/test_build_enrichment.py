from build_enrichment import LIDAR_NO_DATA_LINE, assign_cascade, classify_overture, lidar_manifest
from clue_join import _dominant_use_from_row, clue_use_for_buildings, load_clue_block_uses
from extent import (
    CITY_OF_MELBOURNE_RECT,
    building_in_city_of_melbourne,
    point_in_bounds,
    point_in_city_of_melbourne,
)
from zone_use import use_from_zone as zone_use
from shapely.geometry import Point
import geopandas as gpd
import pandas as pd


def test_classify_overture_subtype():
    assert classify_overture({"subtype": "residential"}) == ("residential", "overture")


def test_zone_use_grz():
    assert zone_use("GRZ1") == "residential"


def test_assign_defaults_unclassified():
    geom = Point(144.98, -37.81)
    row = assign_cascade({}, geom, None, None, None)
    assert row["use"] == "unclassified"
    assert row["use_source"] == "unclassified"


def test_clue_floor_space_dominant():
    dom = _dominant_use_from_row({"office": 100, "retail_shop": 50, "block_id": 1, "census_year": "2024"})
    assert dom == ("commercial", "office")


def test_lidar_manifest_no_data():
    entry = lidar_manifest()
    assert entry["status"] == "no_data"
    assert entry["detail"] == LIDAR_NO_DATA_LINE


def test_clue_beats_zone():
    geom = Point(144.98, -37.81)
    row = assign_cascade({}, geom, None, ("retail", "clue"), None)
    assert row["use_source"] == "clue"


def test_clue_gate_lga_not_legacy_rectangle():
    """Richmond: inside old CLUE rect, outside City of Melbourne LGA."""
    lon, lat = 144.995, -37.825
    assert point_in_bounds(lon, lat, CITY_OF_MELBOURNE_RECT)
    assert not point_in_city_of_melbourne(lon, lat)
    blocks, _, _ = load_clue_block_uses()
    if blocks is None or blocks.empty:
        return
    row = gpd.GeoDataFrame({"overture_id": ["r1"]}, geometry=[Point(lon, lat)], crs="EPSG:4326")
    assert clue_use_for_buildings(row, blocks).iloc[0] is None
    assert not building_in_city_of_melbourne(row.geometry.iloc[0])


def test_clue_join_allowed_inside_city_of_melbourne_lga():
    blocks, _, _ = load_clue_block_uses()
    if blocks is None or blocks.empty:
        return
    cbd = gpd.GeoDataFrame(
        {"overture_id": ["c1"]},
        geometry=[Point(144.965, -37.813)],
        crs="EPSG:4326",
    )
    assert building_in_city_of_melbourne(cbd.geometry.iloc[0])
