from extent import (
    CITY_OF_MELBOURNE_RECT,
    GREATER_MELBOURNE_GCCSA,
    REGION_NAME,
    building_in_bounds,
    point_in_bounds,
    point_in_city_of_melbourne,
)
from shapely.geometry import Point


def test_greater_melbourne_contains_hawthorn():
    assert point_in_bounds(145.0354, -37.8226, GREATER_MELBOURNE_GCCSA)
    assert not point_in_city_of_melbourne(145.0354, -37.8226)


def test_legacy_clue_rect_excludes_richmond_from_lga():
    assert point_in_bounds(144.995, -37.825, CITY_OF_MELBOURNE_RECT)
    assert not point_in_city_of_melbourne(144.995, -37.825)


def test_city_of_melbourne_lga_contains_east_melbourne():
    assert point_in_city_of_melbourne(144.98061, -37.8127)
    assert building_in_bounds(Point(144.98061, -37.8127), CITY_OF_MELBOURNE_RECT)


def test_region_name_documents_gccsa():
    assert "GCCSA" in REGION_NAME and "2GMEL" in REGION_NAME
    assert "Greater Melbourne" in REGION_NAME
