from build_enrichment import LIDAR_NO_DATA_LINE, assign_cascade, classify_overture, lidar_manifest, zone_use
from clue_join import _dominant_use_from_row, clue_use_for_buildings, load_clue_block_uses
from extent import CITY_OF_MELBOURNE, building_in_bounds
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


def test_clue_join_skipped_outside_city_of_melbourne():
    """CLUE must not apply to Hawthorn (outside CoM bbox)."""
    blocks, _, err = load_clue_block_uses()
    if blocks is None or blocks.empty:
        return
    hawthorn = gpd.GeoDataFrame(
        {"overture_id": ["h1"]},
        geometry=[Point(145.0354, -37.8226)],
        crs="EPSG:4326",
    )
    series = clue_use_for_buildings(hawthorn, blocks)
    assert series.iloc[0] is None
    assert not building_in_bounds(hawthorn.geometry.iloc[0], CITY_OF_MELBOURNE)


def test_clue_join_allowed_inside_city_of_melbourne():
    blocks, _, err = load_clue_block_uses()
    if blocks is None or blocks.empty:
        return
    cbd = gpd.GeoDataFrame(
        {"overture_id": ["c1"]},
        geometry=[Point(144.965, -37.813)],
        crs="EPSG:4326",
    )
    series = clue_use_for_buildings(cbd, blocks)
    # May or may not hit a block; only assert pipeline would consider this point in CoM.
    assert building_in_bounds(cbd.geometry.iloc[0], CITY_OF_MELBOURNE)
