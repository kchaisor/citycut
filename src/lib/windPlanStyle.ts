import drawingCss from "../drawing-style.css?raw";
import { parseCustomProperties } from "./cssVars";

const DEFAULTS = parseCustomProperties(drawingCss);

export type WindPlanPen = { colour: string; opacity: number; px: number };

export type WindPlanLineStyle = {
  contour: WindPlanPen;
  buildingEdge: WindPlanPen;
  unsafeOutline: WindPlanPen;
  unsafeHatch: WindPlanPen;
  hatchSpacingPx: number;
  unsafeMinPx: number;
  vector: WindPlanPen;
  vectorHeadPx: number;
  vectorMaxPx: number;
};

function reader(read?: (name: string) => string): (name: string) => string {
  if (read) return (name) => read(name).trim() || DEFAULTS[name] || "";
  if (typeof document === "undefined") return (name) => DEFAULTS[name] ?? "";
  const computed = getComputedStyle(document.documentElement);
  return (name) => computed.getPropertyValue(name).trim() || DEFAULTS[name] || "";
}

function num(get: (name: string) => string, name: string): number {
  const value = Number.parseFloat(get(name));
  if (Number.isFinite(value)) return value;
  return Number.parseFloat(DEFAULTS[name] ?? "0") || 0;
}

export function windPlanLineStyle(read?: (name: string) => string): WindPlanLineStyle {
  const get = reader(read);
  const unsafe = get("--wind-plan-unsafe-stroke");
  return {
    contour: {
      colour: get("--wind-plan-contour-stroke"),
      opacity: num(get, "--wind-plan-contour-opacity"),
      px: num(get, "--wind-plan-contour-px"),
    },
    buildingEdge: {
      colour: get("--wind-plan-building-edge"),
      opacity: num(get, "--wind-plan-building-edge-opacity"),
      px: num(get, "--wind-plan-building-edge-px"),
    },
    unsafeOutline: { colour: unsafe, opacity: 1, px: num(get, "--wind-plan-unsafe-outline-px") },
    unsafeHatch: { colour: unsafe, opacity: 1, px: num(get, "--wind-plan-unsafe-hatch-px") },
    hatchSpacingPx: num(get, "--wind-plan-unsafe-hatch-spacing-px"),
    unsafeMinPx: num(get, "--wind-plan-unsafe-min-px"),
    vector: {
      colour: get("--wind-plan-vector-stroke"),
      opacity: num(get, "--wind-plan-vector-opacity"),
      px: num(get, "--wind-plan-vector-px"),
    },
    vectorHeadPx: num(get, "--wind-plan-vector-head-px"),
    vectorMaxPx: num(get, "--wind-plan-vector-max-px"),
  };
}
