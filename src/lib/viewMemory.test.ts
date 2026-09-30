import { describe, expect, it } from "vitest";
import { frameFromSearch } from "./frameQuery";
import {
  DEFAULT_VIEW,
  VIEW_STORAGE_KEY,
  parseStoredView,
  readStoredView,
  resolveView,
  viewToken,
  writeStoredView,
  writeViewSearch,
  type KeyValueStore,
  type ViewMemory,
} from "./viewMemory";

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
  };
}

const northMelbourne = "?lat=-37.8041&lon=144.94944&km=1&label=North%20Melbourne";

const isoSw: ViewMemory = { projection: "iso", corner: "sw", freeRotate: false };

describe("parseStoredView", () => {
  it("defaults to perspective, the SW corner, and locked rotation", () => {
    expect(parseStoredView(null)).toEqual(DEFAULT_VIEW);
    expect(DEFAULT_VIEW).toEqual({ projection: "perspective", corner: "sw", freeRotate: false });
    expect(parseStoredView("")).toEqual(DEFAULT_VIEW);
    expect(parseStoredView("{")).toEqual(DEFAULT_VIEW);
    expect(parseStoredView('{"projection":"fly","corner":"up","freeRotate":"yes"}')).toEqual(DEFAULT_VIEW);
  });

  it("keeps a stored isometric corner and free rotate", () => {
    expect(parseStoredView(JSON.stringify({ projection: "iso", corner: "ne", freeRotate: true }))).toEqual({
      projection: "iso",
      corner: "ne",
      freeRotate: true,
    });
    expect(parseStoredView(JSON.stringify({ projection: "iso", corner: "se", freeRotate: false })).corner).toBe("se");
  });
});

describe("resolveView", () => {
  it("uses storage when the query has no view param", () => {
    const stored = JSON.stringify({ projection: "iso", corner: "nw", freeRotate: false });
    expect(resolveView(stored, northMelbourne)).toEqual({
      projection: "iso",
      corner: "nw",
      freeRotate: false,
    });
    expect(resolveView(null, "")).toEqual(DEFAULT_VIEW);
    expect(resolveView(null, "?lat=-37.8136&lon=144.9631&km=1")).toEqual(DEFAULT_VIEW);
  });

  it("lets a view param override storage without dropping the frame", () => {
    const stored = JSON.stringify({ projection: "perspective", corner: "se", freeRotate: true });
    expect(resolveView(stored, `${northMelbourne}&view=iso-ne`)).toEqual({
      projection: "iso",
      corner: "ne",
      freeRotate: false,
    });
    expect(resolveView(stored, "?view=iso-sw")).toEqual(isoSw);
    expect(resolveView(stored, "?view=ISO-NW")).toEqual({
      projection: "iso",
      corner: "nw",
      freeRotate: false,
    });
    expect(resolveView(stored, "?view=axo")).toEqual({
      projection: "iso",
      corner: "se",
      freeRotate: true,
    });
    expect(resolveView(stored, "?view=persp")).toEqual({
      projection: "perspective",
      corner: "se",
      freeRotate: false,
    });
    expect(resolveView(stored, "?view=nope")).toEqual({
      projection: "perspective",
      corner: "se",
      freeRotate: true,
    });
  });

  it("keeps lat, lon, km, and label readable beside the view param", () => {
    const search = `${northMelbourne}&view=iso-sw`;
    expect(frameFromSearch(search)).toMatchObject({
      view: { lat: -37.8041, lon: 144.94944 },
      sideKm: 1,
      label: "North Melbourne",
    });
    expect(resolveView(null, search)).toEqual(isoSw);
  });
});

describe("writeViewSearch", () => {
  it("adds a corner token and removes it again for perspective", () => {
    const withIso = writeViewSearch(northMelbourne, isoSw);
    const params = new URLSearchParams(withIso.slice(1));
    expect(params.get("view")).toBe("iso-sw");
    expect(params.get("lat")).toBe("-37.8041");
    expect(params.get("lon")).toBe("144.94944");
    expect(params.get("km")).toBe("1");
    expect(params.get("label")).toBe("North Melbourne");
    expect(frameFromSearch(withIso).label).toBe("North Melbourne");
    expect(viewToken(isoSw)).toBe("iso-sw");

    const cleared = writeViewSearch(withIso, DEFAULT_VIEW);
    expect(new URLSearchParams(cleared.slice(1)).get("view")).toBeNull();
    expect(frameFromSearch(cleared)).toMatchObject({
      view: { lat: -37.8041, lon: 144.94944 },
      sideKm: 1,
      label: "North Melbourne",
    });
    expect(viewToken(DEFAULT_VIEW)).toBeNull();
    expect(viewToken({ projection: "iso", corner: "nw", freeRotate: true })).toBe("axo");
  });
});

describe("localStorage view", () => {
  it("round-trips projection, corner, and free rotate", () => {
    const store = memory();
    expect(readStoredView(store)).toEqual(DEFAULT_VIEW);
    const saved: ViewMemory = { projection: "iso", corner: "se", freeRotate: true };
    writeStoredView(store, saved);
    expect(store.data[VIEW_STORAGE_KEY]).toBe(JSON.stringify(saved));
    expect(readStoredView(store)).toEqual(saved);
    expect(resolveView(store.getItem(VIEW_STORAGE_KEY), "")).toEqual(saved);
  });

  it("ignores a store that throws", () => {
    const broken: KeyValueStore = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    };
    expect(readStoredView(broken)).toEqual(DEFAULT_VIEW);
    expect(() => writeStoredView(broken, isoSw)).not.toThrow();
  });
});
