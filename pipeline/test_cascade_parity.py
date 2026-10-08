import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import Point

from build_enrichment import assign_cascade


def _live_like_assign(props: dict, zone_code: str | None, height_m: float = 9.0) -> dict:
    row_props = {**props, "height": height_m}
    zones = None
    if zone_code:
        zones = gpd.GeoDataFrame({"zone_code": [zone_code]}, geometry=[Point(0, 0)], crs="EPSG:4326")
    return assign_cascade(row_props, Point(0, 0), zones, None, None)


def test_cascade_parity_fixtures_match_assign_cascade():
    path = Path(__file__).resolve().parents[1] / "shared" / "cascade-parity-fixtures.json"
    cases = json.loads(path.read_text(encoding="utf-8"))["cases"]
    for case in cases:
        row = _live_like_assign(case.get("props") or {}, case.get("zoneCode"), case.get("heightM", 9))
        assert row["use"] != "unclassified", case["id"]
        assert row["use_source"] != "unclassified", case["id"]
        if (case.get("props") or {}).get("class") == "pavilion":
            assert row["use"] == "recreation"
            assert row["use_source"] == "overture"
        zone = case.get("zoneCode") or ""
        if zone.startswith("HCTZ") or zone.startswith("R1Z"):
            if not (case.get("props") or {}).get("class"):
                assert row["use"] == "residential"
                assert row["use_source"] == "zone"
