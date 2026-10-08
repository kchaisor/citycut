import json
from pathlib import Path

from overture_tag_classify import OSM_BUILDING_USE


def test_overture_table_matches_shared_json():
    path = Path(__file__).resolve().parents[1] / "shared" / "overture-building-use.json"
    shared = json.loads(path.read_text(encoding="utf-8"))
    assert OSM_BUILDING_USE == shared
