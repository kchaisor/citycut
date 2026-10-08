"""SHA-256 of shared JSON tables (must match src/lib/enrichmentTableHashes.ts)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
ZONE_USE_PATH = _REPO / "shared" / "vicmap-zone-use.json"
OVERTURE_USE_PATH = _REPO / "shared" / "overture-building-use.json"


def sha256_json_file(path: Path) -> str:
    data = json.loads(path.read_text(encoding="utf-8"))
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def enrichment_table_hashes() -> dict[str, str]:
    return {
        "zoneUseTableSha256": sha256_json_file(ZONE_USE_PATH),
        "overtureBuildingUseSha256": sha256_json_file(OVERTURE_USE_PATH),
    }
