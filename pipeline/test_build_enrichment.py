from build_enrichment import assign_cascade, classify_overture, zone_use
from clue_join import _dominant_use_from_row
from shapely.geometry import Point


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


def test_clue_beats_zone():
    geom = Point(144.98, -37.81)
    row = assign_cascade({}, geom, None, ("retail", "clue"), None)
    assert row["use_source"] == "clue"
