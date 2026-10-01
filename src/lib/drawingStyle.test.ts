import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CONTOUR_INDEX_EVERY_VAR,
  CONTOUR_INDEX_MM_VAR,
  DEFAULT_LINE_STYLES,
  LINE_STYLES_KEY,
  PATH_EDGE_VAR,
  PATH_FILL_VAR,
  PATH_WIDTH_VAR,
  ROAD_FILL_VAR,
  ROAD_KERB_VAR,
  STROKE_KEYS,
  STROKE_VARS,
  changedVariables,
  copyCssText,
  dashIsDotted,
  dashPresetId,
  normalizeDash,
  formatMetres,
  parseColor,
  parseMetres,
  parseMm,
  readStoredOverrides,
  screenPenAttrs,
  styleFromProperties,
  writeStoredOverrides,
  type StorageLike,
} from "./drawingStyle";

function memoryStorage(initial = ""): StorageLike & { snapshot(): string | null } {
  let value: string | null = initial || null;
  return {
    getItem: (key) => (key === LINE_STYLES_KEY ? value : null),
    setItem: (key, next) => {
      if (key === LINE_STYLES_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === LINE_STYLES_KEY) value = null;
    },
    snapshot: () => value,
  };
}

async function cssFileValues(): Promise<Map<string, string>> {
  const bytes = await readFile(fileURLToPath(new URL("../drawing-style.css", import.meta.url)));
  const css = new TextDecoder().decode(bytes);
  const values = new Map<string, string>();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    values.set(match[1], match[2].trim());
  }
  return values;
}

describe("drawing style css", () => {
  it("reads a stylesheet value over the typescript default", () => {
    const style = styleFromProperties((name) => {
      if (name === "--contour-stroke") return "#ff0000";
      if (name === "--contour-dash") return "0 0.6";
      if (name === "--building-stroke-mm") return "0.55";
      if (name === "--road-fill") return "#333333";
      if (name === "--road-kerb") return "off";
      return "";
    });
    expect(style.contour.color).toBe("#FF0000");
    expect(style.contour.dash).toBe("0 0.6");
    expect(dashIsDotted(style.contour.dash)).toBe(true);
    expect(style.contour.mm).toBe(DEFAULT_LINE_STYLES.contour.mm);
    expect(style.building.mm).toBe(0.55);
    expect(style.building.color).toBe(DEFAULT_LINE_STYLES.building.color);
    expect(style.roadFill).toBe("#333333");
    expect(style.kerbOn).toBe(false);
    expect(parseColor("rgb(74, 74, 74)")).toBe("#4A4A4A");
    expect(parseMm("0.22mm")).toBe(0.22);
    expect(normalizeDash("1.50, 0.75")).toBe("1.5 0.75");
    expect(dashPresetId("none")).toBe("solid");
    expect(dashPresetId("0 0.6")).toBe("dotted");
    expect(dashPresetId("2 1")).toBe("custom");
  });

  it("matches every variable in drawing-style.css to the defaults", async () => {
    const css = await cssFileValues();
    expect(css.get(ROAD_FILL_VAR)?.toUpperCase()).toBe(DEFAULT_LINE_STYLES.roadFill);
    expect(css.get(ROAD_KERB_VAR)).toBe(DEFAULT_LINE_STYLES.kerbOn ? "on" : "off");
    expect(css.get(PATH_WIDTH_VAR)).toBe(formatMetres(DEFAULT_LINE_STYLES.pathWidthM));
    expect(css.get(PATH_FILL_VAR)?.toUpperCase()).toBe(DEFAULT_LINE_STYLES.pathFill);
    expect(css.get(PATH_EDGE_VAR)).toBe(DEFAULT_LINE_STYLES.pathEdgeOn ? "on" : "off");
    expect(DEFAULT_LINE_STYLES.pathFill).toBe("#DADADA");
    expect(DEFAULT_LINE_STYLES.pathWidthM).toBe(1.2);
    expect(css.get(CONTOUR_INDEX_MM_VAR)).toBe(String(DEFAULT_LINE_STYLES.contourIndexMm));
    expect(css.get(CONTOUR_INDEX_EVERY_VAR)).toBe(String(DEFAULT_LINE_STYLES.contourIndexEvery));
    for (const key of STROKE_KEYS) {
      const vars = STROKE_VARS[key];
      expect(css.get(vars.mm)).toBe(String(DEFAULT_LINE_STYLES[key].mm));
      expect(css.get(vars.color)?.toUpperCase()).toBe(DEFAULT_LINE_STYLES[key].color);
      expect(normalizeDash(css.get(vars.dash))).toBe(normalizeDash(DEFAULT_LINE_STYLES[key].dash));
    }
  });

  it("persists overrides in localStorage and drops unknown keys", () => {
    const storage = memoryStorage();
    writeStoredOverrides(storage, {
      "--contour-stroke": "#FF0000",
      "--contour-dash": "0 0.6",
      "--road-kerb": "off",
      "--not-a-pen": "12",
    });
    expect(storage.snapshot()).toContain(LINE_STYLES_KEY === "citycut.lineStyles" ? "--contour-stroke" : "");
    const stored = readStoredOverrides(storage);
    expect(stored).toEqual({
      "--contour-stroke": "#FF0000",
      "--contour-dash": "0 0.6",
      "--road-kerb": "off",
    });
    const style = styleFromProperties((name) => stored[name] ?? "");
    expect(style.contour.color).toBe("#FF0000");
    expect(style.kerbOn).toBe(false);
    writeStoredOverrides(storage, {});
    expect(storage.snapshot()).toBeNull();
    expect(readStoredOverrides(memoryStorage("{"))).toEqual({});
  });

  it("copies only the variables that differ from the baseline", () => {
    const current = {
      ...DEFAULT_LINE_STYLES,
      contour: { ...DEFAULT_LINE_STYLES.contour, color: "#FF0000", dash: "0 0.6" },
      kerbOn: false,
    };
    const text = copyCssText(current, DEFAULT_LINE_STYLES);
    expect(text).toContain("/* Paste into src/drawing-style.css */");
    expect(text).toContain("--contour-stroke: #FF0000;");
    expect(text).toContain("--contour-dash: 0 0.6;");
    expect(text).toContain("--road-kerb: off;");
    expect(text).not.toContain("--road-fill");
    expect(text).not.toContain("--building-stroke");
    expect(changedVariables(DEFAULT_LINE_STYLES, DEFAULT_LINE_STYLES)).toEqual({});
    expect(copyCssText(DEFAULT_LINE_STYLES, DEFAULT_LINE_STYLES)).toBe("/* No line-style changes to paste. */\n");
  });

  it("persists footpath width and still reads the old path stroke names as the edge", () => {
    const storage = memoryStorage();
    const wider = { ...DEFAULT_LINE_STYLES, pathWidthM: 2.4 };
    writeStoredOverrides(storage, changedVariables(wider, DEFAULT_LINE_STYLES));
    const stored = readStoredOverrides(storage);
    expect(stored[PATH_WIDTH_VAR]).toBe("2.4");
    const style = styleFromProperties((name) => stored[name] ?? "");
    expect(style.pathWidthM).toBe(2.4);
    const legacyStore = memoryStorage(JSON.stringify({ "--path-width-m": "1.8", "--path-stroke-mm": "0.3" }));
    const legacyStored = readStoredOverrides(legacyStore);
    expect(legacyStored["--path-edge-mm"]).toBe("0.3");
    expect(legacyStored["--path-stroke-mm"]).toBeUndefined();
    expect(styleFromProperties((name) => legacyStored[name] ?? "").path.mm).toBe(0.3);
    expect(parseMetres("1.25m")).toBe(1.3);
    const legacy = styleFromProperties((name) => (name === "--path-stroke" ? "#112233" : ""));
    expect(legacy.path.color).toBe("#112233");
    expect(legacy.pathWidthM).toBe(DEFAULT_LINE_STYLES.pathWidthM);
  });

  it("draws no on-screen stroke when a weight is 0, and brings a building outline back above 0", () => {
    expect(DEFAULT_LINE_STYLES.building.mm).toBe(0);
    expect(screenPenAttrs(DEFAULT_LINE_STYLES.building)).toEqual({ stroke: "none" });
    expect(screenPenAttrs(DEFAULT_LINE_STYLES.green)).toEqual({ stroke: "none" });
    expect(screenPenAttrs(DEFAULT_LINE_STYLES.water)).toEqual({ stroke: "none" });
    const restored = screenPenAttrs({ ...DEFAULT_LINE_STYLES.building, mm: 0.4 }, "miter");
    expect(restored.stroke).toBe(DEFAULT_LINE_STYLES.building.color);
    expect(restored.strokeWidth).toBeGreaterThan(0);
    expect(restored.strokeLinejoin).toBe("miter");
  });
});
