import { describe, expect, it } from "vitest";
import { pointInLocalMulti, unionParcelsLocal } from "./massingParcelBoundary";
import type { ParcelOutline } from "./parcelOutlines";

const origin = { lat: -37.8136, lon: 144.9631 };

function squareParcel(id: string, minE: number, minN: number, size: number): ParcelOutline {
  const ring: [number, number][] = [];
  const corners: [number, number][] = [
    [minE, minN],
    [minE + size, minN],
    [minE + size, minN + size],
    [minE, minN + size],
    [minE, minN],
  ];
  for (const [e, n] of corners) {
    const lat = origin.lat + n / 111_320;
    const lon = origin.lon + e / (111_320 * Math.cos((origin.lat * Math.PI) / 180));
    ring.push([lon, lat]);
  }
  return { id, ring };
}

describe("massingParcelBoundary", () => {
  it("unions adjacent parcels into one boundary", () => {
    const a = squareParcel("a", 0, 0, 20);
    const b = squareParcel("b", 20, 0, 20);
    const merged = unionParcelsLocal([a, b], origin);
    expect(merged.length).toBeGreaterThan(0);
    expect(pointInLocalMulti([10, 10], merged)).toBe(true);
    expect(pointInLocalMulti([30, 10], merged)).toBe(true);
    expect(pointInLocalMulti([50, 10], merged)).toBe(false);
  });
});
