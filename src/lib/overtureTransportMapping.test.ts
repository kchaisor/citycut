import { describe, expect, it } from "vitest";
import {
  isVehicularOvertureSegment,
  roadSpecFromOvertureSegment,
  skipTomTomSegmentWithoutClass,
} from "./overtureTransportMapping";

describe("overtureTransportMapping", () => {
  it("maps road and rail classes to widths", () => {
    expect(roadSpecFromOvertureSegment({ subtype: "road", class: "primary" })?.width).toBe(12);
    expect(roadSpecFromOvertureSegment({ subtype: "road", class: "residential" })?.width).toBe(5.5);
    expect(roadSpecFromOvertureSegment({ subtype: "rail", class: "tram" })?.kind).toBe("rail");
  });

  it("classifies vehicular vs path Overture segments", () => {
    expect(isVehicularOvertureSegment({ subtype: "road", class: "primary" })).toBe(true);
    expect(isVehicularOvertureSegment({ subtype: "road", class: "footway" })).toBe(false);
    expect(isVehicularOvertureSegment({ subtype: "road", class: "cycleway" })).toBe(false);
    expect(isVehicularOvertureSegment({ subtype: "rail", class: "tram" })).toBe(false);
    expect(isVehicularOvertureSegment({ subtype: "water", class: "river" })).toBe(false);
  });

  it("skips TomTom-only segments without class", () => {
    const sources = JSON.stringify([{ provider: "TomTom", dataset: "TomTom Roads" }]);
    expect(skipTomTomSegmentWithoutClass({ sources })).toBe(true);
    expect(roadSpecFromOvertureSegment({ subtype: "road", sources })).toBeNull();
  });
});
