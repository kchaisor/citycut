import { getColour, type ColourKey } from "./colours";
import { normalizeDash, parseMm, type StrokeStyle } from "./drawingStyle";

export type NswPlanStyle = {
  lot: StrokeStyle;
  easement: StrokeStyle;
  centreline: StrokeStyle;
  heritage: StrokeStyle;
  hatchM: number;
  zoningOpacity: number;
  corridorFill: string;
  hobLabel: string;
  fsrLabel: string;
  zoneLabel: string;
};

const DEFAULTS = {
  "--nsw-lot-mm": "0.05",
  "--nsw-lot-dash": "none",
  "--nsw-easement-mm": "0.1",
  "--nsw-easement-dash": "0.8 0.4",
  "--nsw-centreline-mm": "0.08",
  "--nsw-centreline-dash": "2 0.6 0.3 0.6",
  "--nsw-heritage-mm": "0.12",
  "--nsw-heritage-dash": "none",
  "--nsw-hatch-m": "4",
  "--nsw-zoning-opacity": "0.5",
} as const;

type Var = keyof typeof DEFAULTS;

function reader(read?: (name: string) => string): (name: Var) => string {
  if (read) return (name) => read(name).trim() || DEFAULTS[name];
  if (typeof document === "undefined") return (name) => DEFAULTS[name];
  const computed = getComputedStyle(document.documentElement);
  return (name) => computed.getPropertyValue(name).trim() || DEFAULTS[name];
}

function pen(get: (name: Var) => string, mm: Var, dash: Var, colour: ColourKey): StrokeStyle {
  return {
    mm: parseMm(get(mm)) ?? Number(DEFAULTS[mm]),
    color: getColour(colour),
    dash: normalizeDash(get(dash)) ?? DEFAULTS[dash],
  };
}

export function readNswPlanStyle(read?: (name: string) => string): NswPlanStyle {
  const get = reader(read);
  const number = (name: Var, min: number, max: number) => {
    const n = Number(get(name));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : Number(DEFAULTS[name]);
  };
  return {
    lot: pen(get, "--nsw-lot-mm", "--nsw-lot-dash", "--nsw-lot-line"),
    easement: pen(get, "--nsw-easement-mm", "--nsw-easement-dash", "--nsw-easement"),
    centreline: pen(get, "--nsw-centreline-mm", "--nsw-centreline-dash", "--nsw-centreline"),
    heritage: pen(get, "--nsw-heritage-mm", "--nsw-heritage-dash", "--nsw-heritage"),
    hatchM: number("--nsw-hatch-m", 0.5, 50),
    zoningOpacity: number("--nsw-zoning-opacity", 0, 1),
    corridorFill: getColour("--nsw-road-corridor"),
    hobLabel: getColour("--nsw-hob-label"),
    fsrLabel: getColour("--nsw-fsr-label"),
    zoneLabel: getColour("--nsw-zone-label"),
  };
}

export function nswZoneColourKey(code: string): ColourKey {
  const c = code.trim().toUpperCase();
  if (/^RU/.test(c)) return "--nsw-zone-ru";
  if (/^RE/.test(c)) return "--nsw-zone-re";
  if (/^R\d/.test(c)) return "--nsw-zone-r";
  if (/^MU/.test(c) || /^B\d/.test(c)) return "--nsw-zone-mu";
  if (/^E\d/.test(c)) return "--nsw-zone-e";
  if (/^IN/.test(c)) return "--nsw-zone-in";
  if (/^SP/.test(c)) return "--nsw-zone-sp";
  if (/^C\d/.test(c)) return "--nsw-zone-c";
  if (/^W\d/.test(c)) return "--nsw-zone-w";
  return "--nsw-zone-other";
}
