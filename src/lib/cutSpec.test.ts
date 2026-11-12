import { describe, expect, it } from "vitest";
import {
  A3_ASPECT,
  a3GroundMetres,
  a3RatioLockedDrag,
  cutSpecFromA3,
  cutSpecFromSquare,
  formatCutReadout,
} from "./cutSpec";
import { frameFromSearch, writeFrameSearch } from "./frameQuery";

describe("a3GroundMetres", () => {
  it("maps drawing scales to ground metres for landscape A3", () => {
    expect(a3GroundMetres(1000, "landscape")).toEqual({ widthM: 420, heightM: 297 });
    expect(a3GroundMetres(2000, "landscape")).toEqual({ widthM: 840, heightM: 594 });
    expect(a3GroundMetres(2500, "landscape")).toEqual({ widthM: 1050, heightM: 742.5 });
    expect(a3GroundMetres(3000, "landscape")).toEqual({ widthM: 1260, heightM: 891 });
    expect(a3GroundMetres(5000, "landscape")).toEqual({ widthM: 2100, heightM: 1485 });
  });

  it("swaps width and height for portrait", () => {
    expect(a3GroundMetres(2500, "portrait")).toEqual({ widthM: 742.5, heightM: 1050 });
  });
});

describe("formatCutReadout", () => {
  it("formats A3 scale readout", () => {
    const spec = cutSpecFromA3(3000, "landscape");
    expect(formatCutReadout(spec)).toBe("1,260 × 891 m · A3 @ 1:3000");
  });
});

describe("a3RatioLockedDrag", () => {
  it("preserves A3 aspect ratio", () => {
    const { widthM, heightM } = a3RatioLockedDrag(1050, 800, "landscape");
    expect(widthM / heightM).toBeCloseTo(A3_ASPECT, 5);
    expect(widthM).toBeGreaterThanOrEqual(1050);
    expect(heightM).toBeGreaterThanOrEqual(800);
  });
});

describe("A3 URL round-trip", () => {
  it("round-trips shape=a3 with scale and orientation", () => {
    const spec = cutSpecFromA3(2500, "landscape");
    const search = writeFrameSearch("?lat=-37.81&lon=144.96&km=1&label=Test", {
      lat: -37.81,
      lon: 144.96,
      sideKm: 1.05,
      label: "Test",
      cut: spec,
    });
    const parsed = frameFromSearch(search);
    expect(parsed.cut.shape).toBe("a3");
    expect(parsed.cut.scale).toBe(2500);
    expect(parsed.cut.orientation).toBe("landscape");
    expect(parsed.cut.widthM).toBe(1050);
    expect(parsed.cut.heightM).toBe(742.5);
    const again = writeFrameSearch(search, {
      lat: parsed.view.lat,
      lon: parsed.view.lon,
      sideKm: parsed.sideKm,
      label: parsed.label,
      frameShape: parsed.frameShape,
      cut: parsed.cut,
    });
    expect(frameFromSearch(again).cut).toEqual(parsed.cut);
  });

  it("keeps square and circle unchanged in URL", () => {
    const square = writeFrameSearch("", {
      lat: -37.8,
      lon: 145,
      sideKm: 1,
      label: "Sq",
      frameShape: "square",
    });
    expect(frameFromSearch(square).cut.shape).toBe("square");
    expect(new URLSearchParams(square.slice(1)).get("shape")).toBeNull();

    const circle = writeFrameSearch("", {
      lat: -37.8,
      lon: 145,
      sideKm: 1,
      label: "C",
      frameShape: "circle",
    });
    expect(frameFromSearch(circle).cut.shape).toBe("circle");
    expect(frameFromSearch(circle).frameShape).toBe("circle");
  });
});

describe("square cut spec", () => {
  it("uses equal width and height", () => {
    expect(cutSpecFromSquare(1000)).toEqual({
      shape: "square",
      orientation: "landscape",
      widthM: 1000,
      heightM: 1000,
    });
  });
});
