import json
from pathlib import Path

from table_hash import enrichment_table_hashes


def test_table_hashes_match_canonical_json():
    repo = Path(__file__).resolve().parents[1]
    expected = enrichment_table_hashes()
    for key, rel in (
        ("zoneUseTableSha256", "shared/vicmap-zone-use.json"),
        ("overtureBuildingUseSha256", "shared/overture-building-use.json"),
    ):
        data = json.loads((repo / rel).read_text(encoding="utf-8"))
        canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
        import hashlib

        digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        assert expected[key] == digest
