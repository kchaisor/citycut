"""Offline tests for the BCA permit source (no network)."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

import bca_join


def _package(*resources: tuple[str, str]) -> dict:
    return {"resources": [{"name": n, "url": u} for n, u in resources]}


def test_latest_resource_is_newest_full_year_xlsb():
    package = _package(
        ("Building Permit Activity Data 2024", "https://x/2024.xlsb"),
        ("Building Permit Activity Data 2026", "https://x/2026.xlsb"),
        ("Building Permit Activity Data 2025", "https://x/2025.xlsb"),
        ("Building Permit Activity Data Dictionary", "https://x/dict.xlsx"),
    )
    assert bca_join.latest_bca_resource_url(package) == "https://x/2026.xlsb"
    assert bca_join.latest_bca_resource_url({"resources": []}) is None


def test_download_sends_identifying_user_agent_and_reports_403(monkeypatch, tmp_path: Path):
    seen = {}

    class Resp:
        status_code = 403
        ok = False

    def fake_get(url, **kwargs):
        seen["headers"] = kwargs.get("headers") or {}
        return Resp()

    monkeypatch.setattr(bca_join.requests, "get", fake_get)
    ok, err = bca_join.download_bca_xlsb(tmp_path / "b.xlsb", "https://x/2025.xlsb")
    assert not ok and err == "BCA xlsb HTTP 403 (https://x/2025.xlsb)"
    assert seen["headers"]["User-Agent"].startswith("CityCut-enrichment/")


def test_street_only_extract_is_reported_unjoinable(monkeypatch, tmp_path: Path):
    # Columns as published in the 2024 extract: street name, suburb and postcode only.
    df = pd.DataFrame(
        {"cleaned_site_street_name": ["Riverland Road"], "site_town_suburb__c": ["CLYDE"], "basis_bca": ["1a(a)"]}
    )
    monkeypatch.setattr(bca_join, "resolve_bca_url", lambda: "https://x/2025.xlsb")
    monkeypatch.setattr(bca_join, "download_bca_xlsb", lambda dest, url: (True, None))
    monkeypatch.setattr(bca_join, "load_bca_permits", lambda path: df)
    index, meta = bca_join.load_bca_index(tmp_path, {})
    assert index == {}
    assert meta["status"] == "unjoinable"
    assert meta["url"] == "https://x/2025.xlsb"
    assert not bca_join.bca_has_house_numbers(df)


def test_blocked_download_keeps_blocked_status(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(bca_join, "resolve_bca_url", lambda: "https://x/2025.xlsb")
    monkeypatch.setattr(bca_join, "download_bca_xlsb", lambda dest, url: (False, f"BCA xlsb HTTP 403 ({url})"))
    _, meta = bca_join.load_bca_index(tmp_path, {})
    assert meta["status"] == "blocked"
