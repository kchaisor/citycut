import coloursCss from "../colours.css?raw";
import { cssColorToHex, normalizeHex, parseCustomProperties, resolveSheet } from "./cssVars";

/**
 * Fill colours. The values in src/colours.css are the ones Kelvin edits.
 * `COLOUR_FALLBACK` is parsed from that file so tests and Node exports still
 * have a colour when there is no document. In the browser, `getColour` reads
 * the computed custom property, which includes a live edit from the Colours panel.
 */

export const COLOUR_KEYS = [
  "--sheet-fill",
  "--ground-fill",
  "--export-backdrop",
  "--figure-fill",
  "--plan-empty",
  "--contour-label",
  "--building-uniform",
  "--building-manual",
  "--site-building",
  "--site-building-edge",
  "--site-boundary",
  "--use-residential",
  "--use-commercial",
  "--use-retail",
  "--use-mixed",
  "--use-industrial",
  "--use-civic",
  "--use-recreation",
  "--use-outbuilding",
  "--use-unclassified",
  "--source-osm",
  "--source-zone",
  "--source-none",
  "--road-fill",
  "--path-fill",
  "--road-arterial",
  "--road-local",
  "--road-path",
  "--green-fill",
  "--green-3d",
  "--water-fill",
  "--water-3d",
  "--water-sunpath",
  "--sun-study-surface",
  "--tree-fill",
  "--outline-building",
  "--outline-tree",
  "--outline-road",
  "--outline-path",
  "--outline-green",
  "--outline-water",
  "--outline-rail",
  "--outline-tram",
  "--outline-contour",
  "--tram-line-stroke",
  "--tree-crown",
  "--tree-crown-edge",
  "--tree-trunk",
  "--tree-layer",
  "--rail-fill",
  "--ground-edge",
  "--hatch-paper",
  "--hatch-ink",
  "--terrain-layer",
  "--rhino-fallback",
  "--view-ink",
  "--light-sky",
  "--light-ground",
  "--cut-line",
  "--sun-arc-summer",
  "--sun-arc-equinox",
  "--sun-arc-winter",
  "--sun-marker",
  "--sun-compass",
  "--sun-compass-label",
  "--building-solar-neutral",
  "--heliodon-dial-disc",
  "--shadow-fill",
  "--wind-streak",
  "--wind-rose",
  "--axo-water",
  "--axo-road",
  "--axo-green",
  "--axo-building",
  "--axo-guide",
  "--axo-guide-dash",
  "--axo-label",
  "--axo-plan-flood",
  "--axo-plan-heritage",
  "--axo-plan-ddo",
  "--axo-plan-bmo",
  "--axo-hydro-area",
  "--axo-hydro-course",
  "--axo-rail-line",
  "--axo-rail-station",
  "--axo-pt-train",
  "--axo-pt-tram",
  "--axo-pt-bus",
  "--axo-contour",
] as const;

export type ColourKey = (typeof COLOUR_KEYS)[number];

export const COLOUR_GROUPS = [
  {
    id: "paper",
    title: "Paper and ground",
    keys: ["--sheet-fill", "--ground-fill", "--export-backdrop", "--figure-fill", "--plan-empty", "--contour-label"],
  },
  {
    id: "use",
    title: "Building use",
    keys: [
      "--building-uniform",
      "--building-manual",
      "--site-building",
      "--site-boundary",
      "--use-residential",
      "--use-commercial",
      "--use-retail",
      "--use-mixed",
      "--use-industrial",
      "--use-civic",
      "--use-recreation",
      "--use-outbuilding",
      "--use-unclassified",
    ],
  },
  {
    id: "source",
    title: "Source badges",
    keys: ["--source-osm", "--source-zone", "--source-none"],
  },
  {
    id: "roads",
    title: "Roads and paths",
    keys: ["--road-fill", "--path-fill", "--road-arterial", "--road-local", "--road-path"],
  },
  {
    id: "green",
    title: "Green",
    keys: ["--green-fill", "--green-3d"],
  },
  {
    id: "water",
    title: "Water",
    keys: ["--water-fill", "--water-3d", "--water-sunpath", "--sun-study-surface"],
  },
  {
    id: "trees",
    title: "Trees",
    keys: ["--tree-fill", "--tree-crown", "--tree-crown-edge", "--tree-trunk", "--tree-layer"],
  },
  {
    id: "rail",
    title: "Rail",
    keys: ["--rail-fill"],
  },
  {
    id: "three",
    title: "3D-only materials",
    keys: [
      "--ground-edge",
      "--hatch-paper",
      "--hatch-ink",
      "--terrain-layer",
      "--rhino-fallback",
      "--view-ink",
      "--light-sky",
      "--light-ground",
      "--cut-line",
    ],
  },
  {
    id: "solar",
    title: "Solar heliodon (3D screen only)",
    keys: [
      "--sun-arc-summer",
      "--sun-arc-equinox",
      "--sun-arc-winter",
      "--sun-marker",
      "--sun-compass",
      "--sun-compass-label",
      "--building-solar-neutral",
      "--heliodon-dial-disc",
    ],
  },
  {
    id: "plan-shadows",
    title: "Site plan shadows",
    keys: ["--shadow-fill"],
  },
] as const satisfies readonly { id: string; title: string; keys: readonly ColourKey[] }[];

export const COLOUR_LABELS: Record<ColourKey, string> = {
  "--sheet-fill": "Sheet",
  "--ground-fill": "Ground",
  "--export-backdrop": "Export backdrop",
  "--figure-fill": "Figure-ground",
  "--plan-empty": "Empty plan",
  "--contour-label": "Contour numbers",
  "--building-uniform": "Uniform buildings",
  "--building-manual": "Manual height (3D)",
  "--site-building": "Site buildings",
  "--site-building-edge": "Site building outline (3D)",
  "--site-boundary": "Site parcel boundary",
  "--use-residential": "Residential",
  "--use-commercial": "Commercial",
  "--use-retail": "Retail",
  "--use-mixed": "Mixed use",
  "--use-industrial": "Industrial",
  "--use-civic": "Civic",
  "--use-recreation": "Recreation",
  "--use-outbuilding": "Outbuilding",
  "--use-unclassified": "Unclassified",
  "--source-osm": "OSM tag",
  "--source-zone": "Zone",
  "--source-none": "No source",
  "--road-fill": "Road fill",
  "--path-fill": "Footpath fill",
  "--road-arterial": "Arterial",
  "--road-local": "Local street",
  "--road-path": "Path ribbon",
  "--green-fill": "Green",
  "--green-3d": "Green, 3D",
  "--water-fill": "Water",
  "--water-3d": "Water, 3D",
  "--water-sunpath": "Water, sun path (3D)",
  "--sun-study-surface": "Sun path ground (3D)",
  "--tree-fill": "Tree crown",
  "--outline-building": "Building outline",
  "--outline-tree": "Tree outline",
  "--outline-road": "Road outline",
  "--outline-path": "Footpath outline",
  "--outline-green": "Green outline",
  "--outline-water": "Water outline",
  "--outline-rail": "Rail outline",
  "--outline-tram": "Tram outline",
  "--outline-contour": "Contour outline",
  "--tram-line-stroke": "Tram route",
  "--tree-crown": "Tree crown, 3D sheet",
  "--tree-crown-edge": "Tree crown edge",
  "--tree-trunk": "Tree trunk",
  "--tree-layer": "Trees layer",
  "--rail-fill": "Rail",
  "--ground-edge": "Ground edge",
  "--hatch-paper": "Zone hatch paper",
  "--hatch-ink": "Zone hatch ink",
  "--terrain-layer": "Terrain layer",
  "--rhino-fallback": "Rhino fallback",
  "--view-ink": "3D sheet ink",
  "--light-sky": "Sky light",
  "--light-ground": "Ground light",
  "--cut-line": "Satellite frame",
  "--sun-arc-summer": "Sun path, summer",
  "--sun-arc-equinox": "Sun path, equinox",
  "--sun-arc-winter": "Sun path, winter",
  "--sun-marker": "Sun marker",
  "--sun-compass": "Compass ring",
  "--sun-compass-label": "Compass labels",
  "--building-solar-neutral": "Solar neutral buildings",
  "--heliodon-dial-disc": "Heliodon dial disc",
  "--shadow-fill": "Building shadows",
  "--wind-streak": "Wind streaks (3D)",
  "--wind-rose": "Wind rose overlay",
  "--axo-water": "Exploded axo water",
  "--axo-road": "Exploded axo roads",
  "--axo-green": "Exploded axo green",
  "--axo-building": "Exploded axo buildings",
  "--axo-guide": "Exploded axo guides",
  "--axo-guide-dash": "Exploded axo guide dash",
  "--axo-label": "Exploded axo labels",
  "--axo-plan-flood": "Exploded axo planning flood overlay",
  "--axo-plan-heritage": "Exploded axo heritage overlay",
  "--axo-plan-ddo": "Exploded axo DDO overlay",
  "--axo-plan-bmo": "Exploded axo BMO overlay",
  "--axo-hydro-area": "Exploded axo hydro water area",
  "--axo-hydro-course": "Exploded axo hydro watercourse",
  "--axo-rail-line": "Exploded axo rail line",
  "--axo-rail-station": "Exploded axo rail station",
  "--axo-pt-train": "Exploded axo train route",
  "--axo-pt-tram": "Exploded axo tram route",
  "--axo-pt-bus": "Exploded axo bus route",
  "--axo-contour": "Exploded axo contour",
};

const parsed = resolveSheet(parseCustomProperties(coloursCss));

function fallbackTable(): Record<ColourKey, string> {
  const table = {} as Record<ColourKey, string>;
  for (const key of COLOUR_KEYS) {
    const value = normalizeHex(parsed[key] ?? "");
    if (!value || value.length !== 7) throw new Error(`colours.css is missing a hex value for ${key}`);
    table[key] = value;
  }
  return table;
}

/** File defaults. Uppercase six-digit hex, one entry per key, parsed from colours.css. */
export const COLOUR_FALLBACK: Record<ColourKey, string> = fallbackTable();

const KNOWN = new Set<string>(COLOUR_KEYS);

export function isColourKey(name: string): name is ColourKey {
  return KNOWN.has(name);
}

/**
 * The fill currently assigned to a colour variable.
 * With a document, this is the computed value, so a Colours edit or a saved
 * override wins over the file. Without a document, the fallback table is used.
 */
export function getColour(name: ColourKey): string {
  if (typeof document !== "undefined") {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const parsedColor = cssColorToHex(raw);
    if (parsedColor) return parsedColor.length === 9 ? parsedColor.slice(0, 7) : parsedColor;
  }
  return COLOUR_FALLBACK[name];
}

/** 0–255 channels for a fill, for Rhino layer colours. */
export function colourRgb(name: ColourKey): { r: number; g: number; b: number } {
  const hex = getColour(name);
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export const COLOURS_KEY = "citycut.colours";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function readStoredColours(storage: StorageLike): Partial<Record<ColourKey, string>> {
  try {
    const raw = storage.getItem(COLOURS_KEY);
    if (!raw) return {};
    const parsedStore = JSON.parse(raw) as unknown;
    if (!parsedStore || typeof parsedStore !== "object" || Array.isArray(parsedStore)) return {};
    const out: Partial<Record<ColourKey, string>> = {};
    for (const [key, value] of Object.entries(parsedStore)) {
      if (!isColourKey(key) || typeof value !== "string") continue;
      const hex = cssColorToHex(value);
      if (hex) out[key] = hex.length === 9 ? hex.slice(0, 7) : hex;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeStoredColours(storage: StorageLike, overrides: Partial<Record<ColourKey, string>>): void {
  const clean: Partial<Record<ColourKey, string>> = {};
  for (const key of COLOUR_KEYS) {
    const hex = overrides[key];
    if (!hex) continue;
    if (hex.toUpperCase() === COLOUR_FALLBACK[key]) continue;
    clean[key] = hex.toUpperCase();
  }
  if (Object.keys(clean).length === 0) storage.removeItem(COLOURS_KEY);
  else storage.setItem(COLOURS_KEY, JSON.stringify(clean));
}

const listeners = new Set<() => void>();
let revision = 0;

export function colourRevision(): number {
  return revision;
}

export function subscribeColours(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function applyColourOverrides(overrides: Partial<Record<ColourKey, string>>, root?: HTMLElement): void {
  const element = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!element) return;
  for (const key of COLOUR_KEYS) {
    const value = overrides[key];
    if (value) element.style.setProperty(key, value);
  }
}

export function clearColourOverrides(root?: HTMLElement): void {
  const element = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!element) return;
  for (const key of COLOUR_KEYS) element.style.removeProperty(key);
}

/**
 * Apply anything saved under `citycut.colours`. Call this after the line-style
 * hydrate so a fill edited here wins over an older line-style copy of the same name.
 */
export function hydrateStoredColours(storage?: StorageLike): Partial<Record<ColourKey, string>> {
  if (typeof document === "undefined") return {};
  let stored: Partial<Record<ColourKey, string>> = {};
  try {
    stored = readStoredColours(storage ?? window.localStorage);
  } catch {
    stored = {};
  }
  applyColourOverrides(stored);
  return stored;
}

export function commitColour(name: ColourKey, value: string, storage?: StorageLike): string | null {
  const hex = cssColorToHex(value);
  if (!hex) return null;
  const next = hex.length === 9 ? hex.slice(0, 7) : hex;
  const area = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  const current = area ? readStoredColours(area) : {};
  if (next === COLOUR_FALLBACK[name]) delete current[name];
  else current[name] = next;
  if (area) {
    try {
      writeStoredColours(area, current);
    } catch {
      // Private mode can reject localStorage. The on-screen colour still updates.
    }
  }
  if (typeof document !== "undefined") {
    if (next === COLOUR_FALLBACK[name]) document.documentElement.style.removeProperty(name);
    else document.documentElement.style.setProperty(name, next);
  }
  notify();
  return next;
}

export function resetStoredColours(storage?: StorageLike, afterClear?: () => void): void {
  const area = storage ?? (typeof window === "undefined" ? null : window.localStorage);
  try {
    area?.removeItem(COLOURS_KEY);
  } catch {
    // Ignore a locked storage area. Clearing the inline properties is enough.
  }
  clearColourOverrides();
  afterClear?.();
  notify();
}

/** Variables whose live value differs from the file. Ready to paste into colours.css. */
export function colourCssText(current: Partial<Record<ColourKey, string>> = {}): string {
  const lines: string[] = [];
  for (const key of COLOUR_KEYS) {
    const value = (current[key] ?? getColour(key)).toUpperCase();
    if (value !== COLOUR_FALLBACK[key]) lines.push(`${key}: ${value};`);
  }
  if (lines.length === 0) return "/* No colour changes to paste. */\n";
  return `/* Paste into src/colours.css */\n${lines.join("\n")}\n`;
}
