import { describe, expect, it } from "vitest";
import { DEFAULT_SIDE_KM, DEFAULT_ZOOM, MAX_SIDE_KM, MIN_SIDE_KM } from "../content/constants";
import { explicitLabel, frameFromSearch, siteAnchorFromSearch, writeFrameSearch, writeSiteAnchorSearch } from "./frameQuery";

const melbourne = {
  view: { lat: -37.8136, lon: 144.9631, zoom: DEFAULT_ZOOM },
  sideKm: DEFAULT_SIDE_KM,
  label: "Melbourne CBD",
};

describe("frameFromSearch", () => {
  it("falls back to Melbourne CBD and the default frame when the query is missing", () => {
    expect(frameFromSearch("")).toEqual(melbourne);
    expect(frameFromSearch("?")).toEqual(melbourne);
  });

  it("treats empty coordinates and an empty km as missing", () => {
    expect(frameFromSearch("?lat=&lon=&km=")).toEqual(melbourne);
    expect(frameFromSearch("lat=%20&lon=%20&km=%20%20")).toEqual(melbourne);
  });

  it("falls back when lat or lon is garbage or out of range", () => {
    expect(frameFromSearch("?lat=nope&lon=xyz&km=lots")).toEqual(melbourne);
    expect(frameFromSearch("?lat=91&lon=144.9631&km=abc")).toEqual(melbourne);
    expect(frameFromSearch("?lat=-37.8136&lon=181")).toEqual(melbourne);
    expect(frameFromSearch("?lat=-90.1&lon=-180.1&km=")).toEqual(melbourne);
    expect(frameFromSearch("?lat=-37.8041&km=1")).toEqual({ ...melbourne, sideKm: 1 });
    expect(frameFromSearch("?lon=144.94944&km=1")).toEqual({ ...melbourne, sideKm: 1 });
  });

  it("keeps a shared frame when a camera view param is also present", () => {
    expect(frameFromSearch("?lat=-37.8041&lon=144.94944&km=1&label=North%20Melbourne&view=iso-sw")).toEqual({
      view: { lat: -37.8041, lon: 144.94944, zoom: DEFAULT_ZOOM },
      sideKm: 1,
      label: "North Melbourne",
    });
    expect(frameFromSearch("?view=iso-ne")).toEqual(melbourne);
  });

  it("keeps a valid shared frame, including a real 0,0", () => {
    expect(frameFromSearch("?lat=-37.8041&lon=144.94944&km=1")).toEqual({
      view: { lat: -37.8041, lon: 144.94944, zoom: DEFAULT_ZOOM },
      sideKm: 1,
      label: "Selected frame",
    });
    expect(frameFromSearch("?lat=-37.8041&lon=144.94944&km=1&label=North%20Melbourne").label).toBe(
      "North Melbourne",
    );
    expect(frameFromSearch("?lat=0&lon=0&km=0.5")).toEqual({
      view: { lat: 0, lon: 0, zoom: DEFAULT_ZOOM },
      sideKm: 0.5,
      label: "Selected frame",
    });
    expect(frameFromSearch("?lat=90&lon=180&km=1").view).toMatchObject({ lat: 90, lon: 180 });
    expect(frameFromSearch("?lat=-90&lon=-180&km=1").view).toMatchObject({ lat: -90, lon: -180 });
  });

  it("uses the default frame size when km is missing, empty, or not numeric, and still clamps a numeric km", () => {
    expect(frameFromSearch("?lat=-37.8041&lon=144.94944").sideKm).toBe(DEFAULT_SIDE_KM);
    expect(frameFromSearch("?lat=-37.8041&lon=144.94944&km=").sideKm).toBe(DEFAULT_SIDE_KM);
    expect(frameFromSearch("?lat=-37.8041&lon=144.94944&km=lots").sideKm).toBe(DEFAULT_SIDE_KM);
    expect(frameFromSearch("?lat=-37.8041&lon=144.94944&km=0").sideKm).toBe(MIN_SIDE_KM);
    expect(frameFromSearch("?lat=-37.8041&lon=144.94944&km=9").sideKm).toBe(MAX_SIDE_KM);
  });
});

describe("writeFrameSearch", () => {
  it("round-trips a full address label and keeps the view param", () => {
    const label = "1–9 Gertrude St, Fitzroy VIC 3065";
    const search = writeFrameSearch("?view=iso-sw", {
      lat: -37.8052929,
      lon: 144.9746389,
      sideKm: 1,
      label,
    });
    expect(explicitLabel(search)).toBe(label);
    expect(frameFromSearch(search)).toMatchObject({
      view: { lat: -37.80529, lon: 144.97464 },
      sideKm: 1,
      label,
    });
    expect(new URLSearchParams(search.slice(1)).get("view")).toBe("iso-sw");
    expect(explicitLabel("?lat=-37.8041&lon=144.94944&km=1")).toBeNull();
  });

  it("round-trips siteLat and siteLon", () => {
    const search = writeSiteAnchorSearch("?lat=-37.81&lon=145.05&km=0.4", {
      lat: -37.81012,
      lon: 145.05123,
    });
    expect(siteAnchorFromSearch(search)).toEqual({ lat: -37.81012, lon: 145.05123 });
  });
});
