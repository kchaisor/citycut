import { describe, expect, it } from "vitest";
import { modelCutSiteId } from "./introPlayed";
import {
  NAMED_VIEWS_STORAGE_KEY,
  allViews,
  applyNamedView,
  captureNamedView,
  deleteView,
  emptyNamedViewsStore,
  isPngExportable,
  parseNamedViewsStore,
  readNamedViewsStore,
  renameView,
  saveView,
  selectedViews,
  viewFileStem,
  viewPngFilename,
  viewPngFilenames,
  viewsForCut,
  viewsZipName,
  writeNamedViewsStore,
  type NamedViewSnapshot,
} from "./namedViews";

const SNAPSHOT: NamedViewSnapshot = {
  view: { projection: "iso", corner: "sw", freeRotate: true },
  pose: {
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
    up: [0, 1, 0],
    target: [4, 5, 6],
    zoom: 2,
    near: 0.1,
    far: 900,
  },
  tab: "3d",
  drawing: "site",
  analyses: { solar: true, wind: false, view: true },
  solar: { showPath: true, castShadows: true, radiusFactor: 1, year: 2026, month: 6, day: 21, hour: 9, minute: 30, sunHours: true },
  wind: { enabled: true, period: "annual", designWind: null, daypart: "all" },
  windStreaksOn: true,
  windPlan: { mode: "comfort", vectorsOn: false, sector: 5, view: "map" },
  renderQuality: "fast",
  sunDomeSizeM: 300,
  viewshed: { eyeM: 1.6, radiusM: 250 },
  sunStudySelected: [3, 4],
  display: { primaryView: false, showOutlines: true, showContours3d: false, hideTrees: true },
  colourByUse: true,
  showSource: false,
  hiddenUses: ["commercial" as never],
  landmarkLabelsOn: false,
  lineStyles: null,
  exploded: false,
  explodeGapM: null,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe("named views capture and apply", () => {
  it("round-trips camera, analysis, display and tab through JSON", () => {
    const view = captureNamedView("  North  corner ", SNAPSHOT, { id: "a", savedAt: 5 });
    expect(view?.name).toBe("North corner");
    const reloaded = parseNamedViewsStore(JSON.stringify(saveView(emptyNamedViewsStore(), "cut", view!)));
    const restored = applyNamedView(viewsForCut(reloaded, "cut")[0]!);
    expect(restored).toEqual(SNAPSHOT);
  });

  it("round-trips the sun hours and wind plan studies", () => {
    const study: NamedViewSnapshot = {
      ...SNAPSHOT,
      view: { projection: "plan", corner: "ne", freeRotate: false },
      analyses: { solar: true, wind: true, view: false },
      solar: {
        ...SNAPSHOT.solar,
        sunHours: true,
        sunHoursWindow: "9to3",
        sunHoursPickedOnly: true,
        showPath: true,
        castShadows: true,
        year: 2026,
        month: 12,
        day: 21,
      },
      sunStudySelected: [7, 9],
      renderQuality: "high",
      wind: { enabled: true, period: "summer", designWind: null, daypart: "afternoon" },
      windStreaksOn: true,
      windPlan: { mode: "comfort", vectorsOn: true, sector: 3, view: "flow" },
    };
    const view = captureNamedView("Plan comfort", study, { id: "p" })!;
    const reloaded = parseNamedViewsStore(JSON.stringify(saveView(emptyNamedViewsStore(), "cut", view)));
    const restored = applyNamedView(viewsForCut(reloaded, "cut")[0]!)!;
    expect(restored).toEqual(study);
    expect(restored.windPlan).toEqual({ mode: "comfort", vectorsOn: true, sector: 3, view: "flow" });
    expect(restored.solar.sunHoursWindow).toBe("9to3");
  });

  it("loads a view saved before the Plan wind view existed, or with an invalid one, on the Wind map", () => {
    for (const windPlan of [{ mode: "speed", vectorsOn: true, sector: null }, { mode: "speed", vectorsOn: true, sector: null, view: "streams" }]) {
      const legacy = JSON.parse(JSON.stringify(SNAPSHOT)) as Record<string, unknown>;
      legacy.windPlan = windPlan;
      const raw = JSON.stringify({ version: 1, byCut: { cut: [{ id: "o", name: "Old", savedAt: 1, snapshot: legacy }] } });
      const restored = applyNamedView(viewsForCut(parseNamedViewsStore(raw), "cut")[0]!)!;
      expect(restored.windPlan.view).toBe("map");
    }
  });

  it("round-trips the exploded axo with its gap", () => {
    const stack: NamedViewSnapshot = { ...SNAPSHOT, exploded: true, explodeGapM: 120 };
    const view = captureNamedView("Stack", stack, { id: "x" })!;
    const reloaded = parseNamedViewsStore(JSON.stringify(saveView(emptyNamedViewsStore(), "cut", view)));
    const restored = applyNamedView(viewsForCut(reloaded, "cut")[0]!)!;
    expect(restored.exploded).toBe(true);
    expect(restored.explodeGapM).toBe(120);
    expect(restored.pose).toEqual(SNAPSHOT.pose);
  });

  it("loads a view saved before the exploded axo was stored as assembled with the default gap", () => {
    const legacy = JSON.parse(JSON.stringify(SNAPSHOT)) as Record<string, unknown>;
    delete legacy.exploded;
    delete legacy.explodeGapM;
    const raw = JSON.stringify({ version: 1, byCut: { cut: [{ id: "o", name: "Old", savedAt: 1, snapshot: legacy }] } });
    const restored = applyNamedView(viewsForCut(parseNamedViewsStore(raw), "cut")[0]!)!;
    expect(restored.exploded).toBe(false);
    expect(restored.explodeGapM).toBeNull();
  });

  it("drops the exploded flag outside the isometric 3D view and ignores a bad gap", () => {
    const odd = { ...SNAPSHOT, exploded: true, explodeGapM: -5, view: { ...SNAPSHOT.view, projection: "plan" as const } };
    const view = captureNamedView("Odd", odd)!;
    expect(view.snapshot.exploded).toBe(false);
    expect(view.snapshot.explodeGapM).toBeNull();
    const bad = captureNamedView("Bad", { ...SNAPSHOT, exploded: true, explodeGapM: -5 })!;
    expect(bad.snapshot.exploded).toBe(true);
    expect(bad.snapshot.explodeGapM).toBeNull();
  });

  it("defaults the wind plan for views saved before it was stored", () => {
    const legacy = JSON.parse(JSON.stringify(SNAPSHOT)) as Record<string, unknown>;
    delete legacy.windPlan;
    const raw = JSON.stringify({ version: 1, byCut: { cut: [{ id: "o", name: "Old", savedAt: 1, snapshot: legacy }] } });
    const restored = applyNamedView(viewsForCut(parseNamedViewsStore(raw), "cut")[0]!)!;
    expect(restored.windPlan).toEqual({ mode: "speed", vectorsOn: true, sector: null, view: "map" });
  });

  it("rejects empty or whitespace names", () => {
    expect(captureNamedView("", SNAPSHOT)).toBeNull();
    expect(captureNamedView("   ", SNAPSHOT)).toBeNull();
  });

  it("gives every capture its own id, even for the same name", () => {
    const a = captureNamedView("Same", SNAPSHOT)!;
    const b = captureNamedView("Same", SNAPSHOT)!;
    expect(a.id).not.toBe(b.id);
  });

  it("ignores unknown exploded axo fields found in raw JSON", () => {
    const raw = JSON.stringify({
      version: 1,
      byCut: {
        cut: [
          {
            id: "x",
            name: "Old",
            savedAt: 1,
            snapshot: { ...SNAPSHOT, exploded: true, axoSettings: { gap: 4 }, explodedGapM: 3 },
          },
        ],
      },
    });
    const restored = applyNamedView(viewsForCut(parseNamedViewsStore(raw), "cut")[0]!)!;
    expect(Object.keys(restored)).not.toContain("axoSettings");
    expect(Object.keys(restored)).not.toContain("explodedGapM");
  });

  it("collapses an unknown drawing kind to the site plan", () => {
    const raw = JSON.stringify({
      version: 1,
      byCut: { cut: [{ id: "x", name: "D", savedAt: 1, snapshot: { ...SNAPSHOT, tab: "drawing", drawing: "exploded-axo" } }] },
    });
    expect(applyNamedView(viewsForCut(parseNamedViewsStore(raw), "cut")[0]!)?.drawing).toBe("site");
  });
});

describe("named views storage", () => {
  it("keeps each cut and cut size separate", () => {
    const here = modelCutSiteId({ lat: -37.81, lon: 144.96 }, 500);
    const bigger = modelCutSiteId({ lat: -37.81, lon: 144.96 }, 1000);
    const elsewhere = modelCutSiteId({ lat: -33.86, lon: 151.2 }, 500);
    let store = emptyNamedViewsStore();
    store = saveView(store, here, captureNamedView("A", SNAPSHOT)!);
    store = saveView(store, bigger, captureNamedView("B", SNAPSHOT)!);
    expect(viewsForCut(store, here).map((v) => v.name)).toEqual(["A"]);
    expect(viewsForCut(store, bigger).map((v) => v.name)).toEqual(["B"]);
    expect(viewsForCut(store, elsewhere)).toEqual([]);
  });

  it("returns an empty list for corrupt or foreign storage", () => {
    for (const raw of ["{not json", "[]", "null", '{"version":2,"byCut":{}}', '{"version":1,"byCut":{"c":"x"}}', null]) {
      expect(viewsForCut(parseNamedViewsStore(raw), "c")).toEqual([]);
    }
    expect(readNamedViewsStore(memoryStorage({ [NAMED_VIEWS_STORAGE_KEY]: "}" }))).toEqual(emptyNamedViewsStore());
  });

  it("drops partial records but keeps good ones for that cut", () => {
    const good = captureNamedView("Good", SNAPSHOT, { id: "g", savedAt: 1 })!;
    const raw = JSON.stringify({
      version: 1,
      byCut: { c: [{ id: "bad", name: "Bad", savedAt: 1, snapshot: { tab: "3d" } }, { name: "no id" }, good] },
    });
    expect(viewsForCut(parseNamedViewsStore(raw), "c").map((v) => v.id)).toEqual(["g"]);
  });

  it("writes and reads back, and swallows quota errors", () => {
    const storage = memoryStorage();
    const store = saveView(emptyNamedViewsStore(), "c", captureNamedView("A", SNAPSHOT)!);
    expect(writeNamedViewsStore(storage, store)).toBe(true);
    expect(viewsForCut(readNamedViewsStore(storage), "c")).toHaveLength(1);
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(writeNamedViewsStore(full, store)).toBe(false);
  });
});

describe("named view list edits", () => {
  const first = captureNamedView("First", SNAPSHOT, { id: "1" })!;
  const second = captureNamedView("Second", SNAPSHOT, { id: "2" })!;
  const store = saveView(saveView(emptyNamedViewsStore(), "c", first), "c", second);

  it("lists newest first", () => {
    expect(viewsForCut(store, "c").map((v) => v.id)).toEqual(["2", "1"]);
  });

  it("renames one view and rejects an empty name", () => {
    const renamed = renameView(store, "c", "1", "  Plaza  ");
    expect(viewsForCut(renamed, "c").map((v) => v.name)).toEqual(["Second", "Plaza"]);
    expect(renameView(store, "c", "1", "  ")).toBe(store);
  });

  it("deletes one view and drops the empty cut", () => {
    const left = deleteView(store, "c", "2");
    expect(viewsForCut(left, "c").map((v) => v.id)).toEqual(["1"]);
    expect(deleteView(left, "c", "1").byCut).toEqual({});
  });

  it("separates selected views from all views", () => {
    const list = viewsForCut(store, "c");
    expect(selectedViews(list, ["1"]).map((v) => v.id)).toEqual(["1"]);
    expect(selectedViews(list, [])).toEqual([]);
    expect(allViews(list).map((v) => v.id)).toEqual(["2", "1"]);
  });

  it("only exports 3D views as PNG", () => {
    expect(isPngExportable(first)).toBe(true);
    expect(isPngExportable(captureNamedView("S", { ...SNAPSHOT, tab: "satellite" })!)).toBe(false);
  });
});

describe("named view file names", () => {
  it("makes safe file stems", () => {
    expect(viewPngFilename("North corner")).toBe("North-corner.png");
    expect(viewPngFilename("a/b\\c: d?")).toBe("a-b-c-d.png");
    expect(viewPngFilename("")).toBe("view.png");
    expect(viewPngFilename("  ..  ")).toBe("view.png");
    expect(viewFileStem("x".repeat(200))).toHaveLength(80);
  });

  it("keeps duplicate names apart", () => {
    expect(viewPngFilenames([{ name: "Plaza" }, { name: "plaza" }, { name: "Plaza" }, { name: "Other" }])).toEqual([
      "Plaza.png",
      "plaza-2.png",
      "Plaza-3.png",
      "Other.png",
    ]);
  });

  it("names the zip after the site", () => {
    expect(viewsZipName("citycut-melbourne-37.8100S-144.9600E-500m")).toBe(
      "citycut-melbourne-37.8100S-144.9600E-500m-views.zip",
    );
  });
});

describe("saved wind season and time of day", () => {
  function reopen(wind: unknown) {
    const view = { id: "v", name: "Wind", savedAt: 1, snapshot: { ...SNAPSHOT, wind } };
    return applyNamedView(view as never)!.wind;
  }

  it("falls back to annual, all day and no design wind for older or invalid views", () => {
    const fallback = { enabled: true, period: "annual", designWind: null, daypart: "all" };
    expect(reopen({ enabled: true })).toEqual(fallback);
    expect(reopen({ enabled: true, period: "monsoon", daypart: "midnight", designWind: "north" })).toEqual(fallback);
    expect(reopen({ enabled: true, period: 4, daypart: null, designWind: 7 })).toEqual(fallback);
  });

  it("round-trips Spring, Morning and a design wind", () => {
    expect(reopen({ enabled: false, period: "spring", daypart: "morning", designWind: null })).toEqual({
      enabled: false,
      period: "spring",
      designWind: null,
      daypart: "morning",
    });
    expect(reopen({ enabled: true, period: "annual", daypart: "afternoon", designWind: "design-ne" }).designWind).toBe("design-ne");
    const saved = captureNamedView("Spring", { ...SNAPSHOT, wind: { enabled: true, period: "spring", designWind: null, daypart: "morning" } })!;
    const store = saveView(emptyNamedViewsStore(), "cut", saved);
    const reread = parseNamedViewsStore(JSON.stringify(store));
    expect(reread.byCut.cut![0]!.snapshot.wind).toMatchObject({ period: "spring", daypart: "morning" });
  });
});

