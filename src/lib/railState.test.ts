import { describe, expect, it } from "vitest";
import { BUILDINGS_LEGEND_COLLAPSED_KEY, TREES_LEGEND_COLLAPSED_KEY } from "./panelCollapse";
import {
  MODEL_DRAWER_KEY,
  drawerIsAvailable,
  readModelDrawer,
  reduceRail,
  resolveModelDrawer,
  writeModelDrawer,
  type KeyValueStore,
} from "./railState";

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

describe("reduceRail", () => {
  it("opens one drawer and replaces any other", () => {
    let open: string | null = null;
    open = reduceRail(open, { type: "toggle", id: "layers" });
    expect(open).toBe("layers");
    open = reduceRail(open, { type: "toggle", id: "search" });
    expect(open).toBe("search");
    open = reduceRail(open, { type: "toggle", id: "exports" });
    expect(open).toBe("exports");
  });

  it("toggles the open drawer shut", () => {
    expect(reduceRail("layers", { type: "toggle", id: "layers" })).toBe(null);
    expect(reduceRail("buildings", { type: "toggle", id: "buildings" })).toBe(null);
  });

  it("closes on escape", () => {
    expect(reduceRail("exports", { type: "escape" })).toBe(null);
    expect(reduceRail("search", { type: "close" })).toBe(null);
    expect(reduceRail(null, { type: "escape" })).toBe(null);
  });
});

describe("resolveModelDrawer", () => {
  it("opens Buildings on a wide screen when nothing is stored", () => {
    expect(
      resolveModelDrawer({
        stored: null,
        buildingsCollapsed: null,
        treesCollapsed: null,
        isNarrow: false,
      }),
    ).toBe("buildings");
  });

  it("opens nothing on a narrow screen when nothing is stored", () => {
    expect(
      resolveModelDrawer({
        stored: null,
        buildingsCollapsed: null,
        treesCollapsed: null,
        isNarrow: true,
      }),
    ).toBe(null);
  });

  it("restores a stored drawer, including none, on any width", () => {
    expect(
      resolveModelDrawer({
        stored: "exports",
        buildingsCollapsed: "0",
        treesCollapsed: "0",
        isNarrow: true,
      }),
    ).toBe("exports");
    expect(
      resolveModelDrawer({
        stored: "none",
        buildingsCollapsed: null,
        treesCollapsed: null,
        isNarrow: false,
      }),
    ).toBe(null);
    expect(
      resolveModelDrawer({
        stored: "",
        buildingsCollapsed: null,
        treesCollapsed: null,
        isNarrow: false,
      }),
    ).toBe(null);
  });

  it("migrates an expanded legacy legend and lets buildings win when both are open", () => {
    expect(
      resolveModelDrawer({
        stored: null,
        buildingsCollapsed: "0",
        treesCollapsed: "1",
        isNarrow: true,
      }),
    ).toBe("buildings");
    expect(
      resolveModelDrawer({
        stored: null,
        buildingsCollapsed: "1",
        treesCollapsed: "0",
        isNarrow: true,
      }),
    ).toBe("trees");
    expect(
      resolveModelDrawer({
        stored: null,
        buildingsCollapsed: "false",
        treesCollapsed: "false",
        isNarrow: true,
      }),
    ).toBe("buildings");
  });

  it("stays collapsed when both legacy legends were collapsed", () => {
    expect(
      resolveModelDrawer({
        stored: null,
        buildingsCollapsed: "1",
        treesCollapsed: "1",
        isNarrow: false,
      }),
    ).toBe(null);
  });

  it("ignores an unrecognised stored id and uses the width default", () => {
    expect(
      resolveModelDrawer({
        stored: "maybe",
        buildingsCollapsed: "0",
        treesCollapsed: "0",
        isNarrow: false,
      }),
    ).toBe("buildings");
    expect(
      resolveModelDrawer({
        stored: "maybe",
        buildingsCollapsed: "0",
        treesCollapsed: "0",
        isNarrow: true,
      }),
    ).toBe(null);
  });
});

describe("localStorage restore", () => {
  it("round-trips the open drawer and a collapsed rail", () => {
    const store = memory();
    writeModelDrawer(store, "drawing");
    expect(store.data[MODEL_DRAWER_KEY]).toBe("drawing");
    expect(readModelDrawer(store, true)).toBe("drawing");
    writeModelDrawer(store, null);
    expect(store.data[MODEL_DRAWER_KEY]).toBe("none");
    expect(readModelDrawer(store, false)).toBe(null);
  });

  it("restores from the legacy legend keys when the rail key is absent", () => {
    const store = memory({
      [BUILDINGS_LEGEND_COLLAPSED_KEY]: "1",
      [TREES_LEGEND_COLLAPSED_KEY]: "0",
    });
    expect(readModelDrawer(store, true)).toBe("trees");
  });

  it("drops a restored drawer the current model cannot show", () => {
    expect(drawerIsAvailable("buildings", ["summary", "drawing", "exports"])).toBe(null);
    expect(drawerIsAvailable("exports", ["summary", "drawing", "exports"])).toBe("exports");
    expect(drawerIsAvailable(null, ["summary"])).toBe(null);
  });
});
