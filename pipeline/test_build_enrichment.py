from build_enrichment import assign_row, classify_overture, zone_use
from shapely.geometry import Point


def test_classify_overture_subtype():
    assert classify_overture({"subtype": "residential"}) == ("residential", "overture")


def test_zone_use_grz():
    assert zone_use("GRZ1") == "residential"


def test_assign_defaults_unclassified():
    geom = Point(144.98, -37.81)
    row = assign_row({}, None, None, geom)
    assert row["use"] == "unclassified"
    assert row["use_source"] == "unclassified"
