import json
from pathlib import Path

from zone_use import ZONE_USE

TABLE = Path(__file__).resolve().parents[1] / "shared" / "vicmap-zone-use.json"


def test_zone_use_matches_shared_json():
    expected = json.loads(TABLE.read_text(encoding="utf-8"))
    assert ZONE_USE == expected


def test_hctz_and_r1z_residential():
    assert ZONE_USE["HCTZ"] == "residential"
    assert ZONE_USE["R1Z"] == "residential"
