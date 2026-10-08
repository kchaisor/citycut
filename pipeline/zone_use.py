"""Vicmap zone → use class (mirrors src/lib/buildingUse.ts)."""

from __future__ import annotations

import re

DEFAULT_ZONE_HEIGHT_M = 9.0
C1Z_RETAIL_BELOW_M = 15.0

# After normaliseZoneCode (strip trailing schedule digits only).
ZONE_USE: dict[str, str] = {
    "GRZ": "residential",
    "NRZ": "residential",
    "RGZ": "residential",
    "LDRZ": "residential",
    "RLZ": "residential",
    "TZ": "residential",
    "C2Z": "commercial",
    "B1Z": "commercial",
    "B2Z": "commercial",
    "B3Z": "commercial",
    "B4Z": "commercial",
    "B5Z": "commercial",
    "MUZ": "mixed_use",
    "ACZ": "mixed_use",
    "CCZ": "mixed_use",
    "CDZ": "mixed_use",
    "IN1Z": "industrial",
    "IN2Z": "industrial",
    "IN3Z": "industrial",
    "PUZ": "civic",
    "PPRZ": "recreation",
    "PCRZ": "recreation",
}


def normalise_zone_code(code: str | None) -> str:
    if code is None or (isinstance(code, float) and code != code):
        return ""
    text = str(code).strip()
    if not text or text.lower() == "nan":
        return ""
    return text.upper().replace(" ", "").replace("_", "")


def strip_schedule_suffix(code: str) -> str:
    """GRZ1 → GRZ, C1Z → C1Z (digit before Z is kept)."""
    return re.sub(r"\d+$", "", normalise_zone_code(code))


def resolved_height_m(height, num_floors) -> float:
    if height is not None:
        try:
            h = float(height)
            if h > 0:
                return h
        except (TypeError, ValueError):
            pass
    if num_floors is not None:
        try:
            n = float(num_floors)
            if n > 0:
                return n * 3.0
        except (TypeError, ValueError):
            pass
    return DEFAULT_ZONE_HEIGHT_M


def use_from_zone(code: str | None, height_m: float = DEFAULT_ZONE_HEIGHT_M) -> str | None:
    if not code or not str(code).strip():
        return None
    normalised = strip_schedule_suffix(str(code))
    if normalised == "C1Z":
        return "retail" if height_m < C1Z_RETAIL_BELOW_M else "commercial"
    return ZONE_USE.get(normalised)


def use_from_zone_row(code: str | None, row) -> str | None:
    return use_from_zone(code, resolved_height_m(row.get("height"), row.get("num_floors")))
