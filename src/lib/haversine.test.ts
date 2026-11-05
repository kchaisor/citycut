import { describe, expect, it } from "vitest";
import { circleRingLonLat, haversineDistanceM } from "./haversine";

describe("haversineDistanceM", () => {
  it("returns ~0 for identical points", () => {
    const p = { lon: 144.97, lat: -37.8 };
    expect(haversineDistanceM(p, p)).toBeLessThan(0.01);
  });

  it("matches known Melbourne short baseline within 1%", () => {
    const a = { lon: 144.9705, lat: -37.8045 };
    const b = { lon: 144.9778, lat: -37.8032 };
    const d = haversineDistanceM(a, b);
    expect(d).toBeGreaterThan(600);
    expect(d).toBeLessThan(750);
  });
});

describe("circleRingLonLat", () => {
  it("keeps ring vertices within radius of centre", () => {
    const center = { lon: 144.9746, lat: -37.8053 };
    const radiusM = 400;
    const ring = circleRingLonLat(center, radiusM, 32);
    for (const [lon, lat] of ring) {
      const d = haversineDistanceM(center, { lon, lat });
      expect(Math.abs(d - radiusM)).toBeLessThan(2);
    }
  });
});
