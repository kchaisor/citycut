"""Overture class/subtype/use → building use (mirrors tagsFromOverture + classify in the app)."""

from __future__ import annotations

import json
from pathlib import Path

_TABLE_PATH = Path(__file__).resolve().parents[1] / "shared" / "overture-building-use.json"
OSM_BUILDING_USE: dict[str, str] = json.loads(_TABLE_PATH.read_text(encoding="utf-8"))

TAG_PRIORITY = (
    "civic",
    "recreation",
    "industrial",
    "retail",
    "commercial",
    "residential",
    "outbuilding",
)


def _tokens(value: str | None) -> list[str]:
    if not value:
        return []
    out: list[str] = []
    for chunk in value.lower().split(";"):
        for part in chunk.split(","):
            text = part.strip()
            if text and text not in ("no", "vacant"):
                out.append(text)
    return out


def tags_from_overture_row(row) -> dict[str, str]:
    tags: dict[str, str] = {}
    for key, tag_key in (("class", "building"), ("subtype", "building:use"), ("use", "building:use")):
        raw = row.get(key) if hasattr(row, "get") else None
        if isinstance(raw, str) and raw.strip():
            tags[tag_key] = raw.strip()
    return tags


def classify_tags(tags: dict[str, str]) -> str | None:
    building = _tokens(tags.get("building"))
    use = _tokens(tags.get("building:use"))
    named = building + use
    if any(v in ("mixed", "mixed_use") for v in named):
        return "mixed_use"

    hits: set[str] = set()
    for value in named:
        mapped = OSM_BUILDING_USE.get(value)
        if mapped:
            hits.add(mapped)

    if "residential" in hits and ("retail" in hits or "commercial" in hits):
        return "mixed_use"
    for category in TAG_PRIORITY:
        if category in hits:
            return category
    return None


def classify_overture_row(row) -> tuple[str, str] | None:
    tags = tags_from_overture_row(row)
    if not tags:
        return None
    use = classify_tags(tags)
    if not use:
        return None
    return use, "overture"
