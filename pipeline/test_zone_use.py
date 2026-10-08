from zone_use import strip_schedule_suffix, use_from_zone


def test_strip_schedule_suffix_keeps_c1z():
    assert strip_schedule_suffix("C1Z") == "C1Z"
    assert strip_schedule_suffix("GRZ1") == "GRZ"


def test_use_from_zone_matches_app():
    assert use_from_zone("GRZ7", 9) == "residential"
    assert use_from_zone("HCTZ1", 9) == "residential"
    assert use_from_zone("R1Z", 9) == "residential"
    assert use_from_zone("MUZ", 40) == "mixed_use"
    assert use_from_zone("IN3Z", 8) == "industrial"
    assert use_from_zone("PUZ6", 12) == "civic"
    assert use_from_zone("PPRZ", 6) == "recreation"
    assert use_from_zone("B1Z", 6) == "commercial"
    assert use_from_zone("CDZ", 8) == "mixed_use"
    assert use_from_zone("TRZ2", 8) is None
    assert use_from_zone("UFZ", 8) is None
    assert use_from_zone("SUZ6", 8) is None
    assert use_from_zone("C1Z", 14.99) == "retail"
    assert use_from_zone("C1Z", 18) == "commercial"
