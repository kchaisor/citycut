import { describe, expect, it } from "vitest";
import { cutIntersectsDemographicsArchive } from "./parcelOutlines";
import { squareBBox } from "./geo";

const ARCHIVE = { west: 144.94, south: -37.82, east: 145.01, north: -37.77 };

describe("parcel outline coverage", () => {
  it("Mont Albert North 1000 m cut lies outside the inner-Melbourne PMTiles archive", () => {
    const bounds = squareBBox({ lat: -37.8045, lon: 145.1065 }, 1000);
    expect(cutIntersectsDemographicsArchive(bounds, ARCHIVE)).toBe(false);
  });

  it("East Melbourne QA cut intersects the PMTiles archive", () => {
    const bounds = squareBBox({ lat: -37.8125, lon: 144.9785 }, 1000);
    expect(cutIntersectsDemographicsArchive(bounds, ARCHIVE)).toBe(true);
  });
});
