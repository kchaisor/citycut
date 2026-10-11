import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCityGroup } from "./buildCity";
import { shotFromCamera } from "./cameraShot";
import { fetchComTreesDetailed } from "./comTrees";
import { DEFAULT_LAYERS } from "../content/constants";
import { viewChunks } from "./aiView";
import { treeSourceLoadNotes } from "./trees";
import { fetchTreePage, TreePageTimeoutError } from "./treeSourceFetch";
import { VICMAP_PAGE_SIZE, fetchVicmapTrees, fetchVicmapTreesDetailed } from "./vicmapTrees";
import type { CityModel, Pt } from "../types";

const toorak = { south: -37.8543, west: 145.0057, north: -37.8435, east: 145.0194 };
const eastMelbourne = { south: -37.8172, west: 144.9749, north: -37.8082, east: 144.9863 };

function vicmapFeature(index: number) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [145.01 + index * 0.00001, -37.85] },
    properties: { height_m: 8 + (index % 5), canopy_radius_m: 3, dense_canopy: "N" },
  };
}

function vicmapPage(count: number, exceeded: boolean) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      type: "FeatureCollection",
      properties: { exceededTransferLimit: exceeded },
      features: Array.from({ length: count }, (_, index) => vicmapFeature(index)),
    }),
  };
}

/** A fetch that never answers until its signal aborts, like a stalled ArcGIS page. */
function stalled(_url: unknown, init?: RequestInit): Promise<never> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("per-page tree fetch time limit (Kelvin's Toorak cut: Vicmap 0 from one slow page)", () => {
  it("turns a stalled page into a timeout error, not a hang or a silent empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(stalled));
    await expect(fetchTreePage("https://example.test/", {}, "Vicmap tree points", undefined, 20)).rejects.toBeInstanceOf(
      TreePageTimeoutError,
    );
  });

  it("follows the caller's abort (a new cut) and does not call it a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(stalled));
    const controller = new AbortController();
    const pending = fetchTreePage("https://example.test/", {}, "Vicmap tree points", controller.signal, 10_000);
    controller.abort();
    await expect(pending).rejects.not.toBeInstanceOf(TreePageTimeoutError);
  });
});

describe("Vicmap tree points", () => {
  it("keeps the pages that arrived when a later page stalls, and says the tier is incomplete", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: unknown, init?: RequestInit) => {
        calls += 1;
        return calls <= 2 ? Promise.resolve(vicmapPage(VICMAP_PAGE_SIZE, true)) : stalled(url, init);
      }),
    );
    const result = await fetchVicmapTreesDetailed(toorak, undefined, 20, 1);
    expect(result.rows).toHaveLength(2 * VICMAP_PAGE_SIZE);
    expect(result.partial).toBe(true);
    expect(result.error).toMatch(/Vicmap tree points are incomplete: 2 pages \(4000 points\) loaded/);
    // The compatibility wrapper also keeps a partial load instead of throwing it away.
    calls = 0;
    vi.useFakeTimers();
    try {
      const pending = fetchVicmapTrees(toorak);
      await vi.advanceTimersByTimeAsync(45_000);
      expect(await pending).toHaveLength(2 * VICMAP_PAGE_SIZE);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a failure that loads nothing (HTTP 503) instead of a silent zero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const result = await fetchVicmapTreesDetailed(toorak, undefined, 20_000, 1);
    expect(result.rows).toHaveLength(0);
    expect(result.partial).toBe(false);
    expect(result.error).toMatch(/^Vicmap tree points could not be loaded, so that tier is missing\. .*503/);
    await expect(fetchVicmapTrees(toorak)).rejects.toThrow(/503/);
  });

  it("gives every page its own time limit: three slow pages that sum past 20 s still all load", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers();
    try {
      const pages = [vicmapPage(VICMAP_PAGE_SIZE, true), vicmapPage(VICMAP_PAGE_SIZE, true), vicmapPage(1550, false)];
      let index = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          const page = pages[index++];
          return new Promise((resolve) => setTimeout(() => resolve(page), 9_000));
        }),
      );
      const pending = fetchVicmapTreesDetailed(toorak);
      await vi.advanceTimersByTimeAsync(30_000);
      const result = await pending;
      expect(result.error).toBeNull();
      expect(result.rows).toHaveLength(5550);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("one retry on a transient page failure", () => {
  it("retries the ArcGIS HTTP 400 seen live at East Melbourne, and the tier loads", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1 ? { ok: false, status: 400, json: async () => ({}) } : vicmapPage(561, false);
      }),
    );
    const result = await fetchVicmapTreesDetailed(eastMelbourne, undefined, 20_000, 1);
    expect(calls).toBe(2);
    expect(result).toMatchObject({ error: null, partial: false });
    expect(result.rows).toHaveLength(561);
  });

  it("retries an 'Unable to perform query' error body once", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return calls === 1
          ? { ok: true, status: 200, json: async () => ({ error: { code: 400, message: "", details: ["Unable to perform query. Please check your parameters."] } }) }
          : vicmapPage(10, false);
      }),
    );
    const result = await fetchVicmapTreesDetailed(toorak, undefined, 20_000, 1);
    expect(calls).toBe(2);
    expect(result.rows).toHaveLength(10);
  });

  it("does not retry auth or rate-limit answers (403, 429), and says so", async () => {
    for (const status of [403, 429]) {
      let calls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          calls += 1;
          return { ok: false, status, json: async () => ({}) };
        }),
      );
      const result = await fetchVicmapTreesDetailed(toorak, undefined, 20_000, 1);
      expect(calls).toBe(1);
      expect(result.error).toContain(String(status));
    }
  });
});

describe("City of Melbourne tree records", () => {
  const rows = (n: number, offset: number) =>
    Array.from({ length: n }, (_, i) => ({ latitude: -37.812, longitude: 144.98 + (offset + i) * 1e-6, diameter_breast_height: 30 }));

  it("returns nothing and no error outside the City of Melbourne (Toorak)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await fetchComTreesDetailed(toorak)).toEqual({ rows: [], error: null, partial: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a first-page failure, and keeps a clean prefix when a later page fails", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const failed = await fetchComTreesDetailed(eastMelbourne, undefined, 20_000, 1);
    expect(failed.rows).toHaveLength(0);
    expect(failed.error).toMatch(/^City of Melbourne tree records could not be loaded, so that tier is missing\. .*503/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        const offset = Number(new URL(String(url)).searchParams.get("offset"));
        if (offset === 300) return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ total_count: 600, results: rows(100, offset) }) };
      }),
    );
    const partial = await fetchComTreesDetailed(eastMelbourne, undefined, 20_000, 1);
    expect(partial.partial).toBe(true);
    expect(partial.rows).toHaveLength(300);
    expect(partial.error).toMatch(/City of Melbourne tree records are incomplete: 300 of 600 loaded/);
  });
});

describe("tree source notes", () => {
  it("lists one note per failed source in tier order, and none when all loaded", () => {
    expect(treeSourceLoadNotes({ com: null, vicmap: null, base: null })).toEqual([]);
    expect(treeSourceLoadNotes({ com: "c", vicmap: "v", base: "b" }).map((n) => n.source)).toEqual([
      "com",
      "base",
      "vicmap",
    ]);
  });
});

const square = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

function treeModel(treesOn: boolean): CityModel {
  return {
    placeLabel: "Trees",
    center: { lon: 145.01256, lat: -37.84886 },
    sideM: 100,
    layers: { buildings: true, roads: false, waterGreen: false, trees: treesOn },
    buildings: [{ id: 1, ring: square(-10, -10, 10, 10), holes: [], height: 9, use: "residential", source: "osm_tag" }],
    roads: [],
    areas: [],
    trees: [
      { id: 2, at: [25, 25], height_m: 10, crown_diameter_m: 6, trunk_diameter_m: 0.3, sizeSource: "vicmap", tier: "vicmap" },
      { id: 3, at: [-25, 25], height_m: 12, crown_diameter_m: 8, trunk_diameter_m: 0.3, sizeSource: "vicmap", tier: "vicmap" },
    ],
    roadKm: 0,
    buildingCapHit: false,
    sourceNote: "",
  };
}

describe("3D, .3dm and the 3D-view .ai agree on trees", () => {
  it("draws trees by default", () => {
    expect(DEFAULT_LAYERS.trees).toBe(true);
  });

  it("the 3D-view .ai follows the Trees layer like the 3D scene (buildCity) does", () => {
    const camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.5, 4000);
    camera.position.set(-90, 80, 110);
    camera.lookAt(0, 6, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const shot = shotFromCamera(camera, 640, 400);
    const style = { uniformBuildings: false, colourBySource: false };
    const treeChunks = (m: CityModel) =>
      viewChunks(m, shot, style).filter((chunk) => chunk.name === "Trees" && ((chunk.ellipses?.length ?? 0) > 0));
    const sceneTrees = (m: CityModel) => {
      const group = buildCityGroup(m);
      let found = 0;
      group.traverse((o) => {
        if (o.name === "Trees") found += 1;
      });
      return found;
    };
    expect(sceneTrees(treeModel(true))).toBe(1);
    expect(treeChunks(treeModel(true)).flatMap((c) => c.ellipses ?? [])).toHaveLength(2);
    expect(sceneTrees(treeModel(false))).toBe(0);
    expect(treeChunks(treeModel(false))).toHaveLength(0);
  });
});
