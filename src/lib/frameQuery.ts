import {
  DEFAULT_SIDE_KM,
  DEFAULT_ZOOM,
  MAX_SIDE_KM,
  MELBOURNE,
  MELBOURNE_LABEL,
  MIN_SIDE_KM,
} from "../content/constants";
import type { LonLat, ViewState } from "../types";
import {
  A3_DRAWING_SCALES,
  a3GroundMetres,
  cutSpecFromA3,
  cutSpecFromCircle,
  cutSpecFromSquare,
  cutSpecSideM,
  defaultA3Scale,
  type A3DrawingScale,
  type CutOrientation,
  type CutSpec,
} from "./cutSpec";
import { DEFAULT_SITE_FRAME_SHAPE, readSiteFrameShape, type SiteFrameShape } from "./siteFrame";

export type FrameQuery = {
  view: ViewState;
  sideKm: number;
  label: string;
  frameShape: SiteFrameShape;
  cut: CutSpec;
};

function readNumber(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readCoordinate(raw: string | null, min: number, max: number): number | null {
  const value = readNumber(raw);
  if (value == null || value < min || value > max) return null;
  return value;
}

function readSideKm(raw: string | null): number {
  const value = readNumber(raw);
  if (value == null) return DEFAULT_SIDE_KM;
  return Math.min(MAX_SIDE_KM, Math.max(MIN_SIDE_KM, value));
}

function readA3Scale(raw: string | null): A3DrawingScale {
  const value = readNumber(raw);
  if (value == null) return defaultA3Scale();
  const match = A3_DRAWING_SCALES.find((scale) => scale === value);
  return match ?? defaultA3Scale();
}

function readOrientation(raw: string | null): CutOrientation {
  const value = raw?.trim().toLowerCase();
  return value === "portrait" ? "portrait" : "landscape";
}

function cutFromParams(params: URLSearchParams, sideKm: number, frameShape: SiteFrameShape): CutSpec {
  if (frameShape === "a3") {
    const orientation = readOrientation(params.get("a3ori"));
    const wm = readNumber(params.get("wm"));
    const hm = readNumber(params.get("hm"));
    if (wm != null && hm != null && wm > 0 && hm > 0) {
      const scale = readA3Scale(params.get("a3scale"));
      return { shape: "a3", orientation, scale, widthM: wm, heightM: hm };
    }
    const scale = readA3Scale(params.get("a3scale"));
    return cutSpecFromA3(scale, orientation);
  }
  const sideM = sideKm * 1000;
  if (frameShape === "circle") return cutSpecFromCircle(sideM);
  return cutSpecFromSquare(sideM);
}

function baseQuery(
  params: URLSearchParams,
  lat: number | null,
  lon: number | null,
  sideKm: number,
  frameShape: SiteFrameShape,
): FrameQuery {
  const cut = cutFromParams(params, sideKm, frameShape);
  const resolvedSideKm =
    frameShape === "a3" ? Math.round((cutSpecSideM(cut) / 1000) * 1000) / 1000 : sideKm;
  if (lat == null || lon == null) {
    return {
      view: { lat: MELBOURNE.lat, lon: MELBOURNE.lon, zoom: DEFAULT_ZOOM },
      sideKm: resolvedSideKm,
      label: MELBOURNE_LABEL,
      frameShape,
      cut,
    };
  }
  return {
    view: { lat, lon, zoom: DEFAULT_ZOOM },
    sideKm: resolvedSideKm,
    label: params.get("label") || "Selected frame",
    frameShape,
    cut,
  };
}

export function frameFromSearch(search: string): FrameQuery {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const lat = readCoordinate(params.get("lat"), -90, 90);
  const lon = readCoordinate(params.get("lon"), -180, 180);
  const sideKm = readSideKm(params.get("km"));
  const frameShape = readSiteFrameShape(params.get("shape"));
  return baseQuery(params, lat, lon, sideKm, frameShape);
}

export function explicitLabel(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const label = params.get("label");
  if (label == null || label.trim() === "") return null;
  return label;
}

function trimCoord(value: number): string {
  return value.toFixed(5).replace(/\.?0+$/, "");
}

function trimKm(km: number): string {
  return String(Math.round(km * 1000) / 1000);
}

function trimM(m: number): string {
  return String(Math.round(m * 1000) / 1000);
}

export function writeFrameSearch(
  search: string,
  frame: {
    lat: number;
    lon: number;
    sideKm: number;
    label: string;
    frameShape?: SiteFrameShape;
    cut?: CutSpec;
  },
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("lat", trimCoord(frame.lat));
  params.set("lon", trimCoord(frame.lon));
  params.set("label", frame.label);
  const cut = frame.cut;
  const shape = cut?.shape ?? frame.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  if (shape === "circle") {
    params.set("shape", "circle");
    params.delete("a3scale");
    params.delete("a3ori");
    params.delete("wm");
    params.delete("hm");
    params.set("km", trimKm(frame.sideKm));
  } else if (shape === "a3" && cut) {
    params.set("shape", "a3");
    params.set("km", trimKm(cutSpecSideM(cut) / 1000));
    params.set("a3scale", String(cut.scale ?? defaultA3Scale()));
    params.set("a3ori", cut.orientation);
    const preset = cut.scale ? a3GroundMetres(cut.scale, cut.orientation) : null;
    const matchesPreset =
      preset &&
      Math.abs(cut.widthM - preset.widthM) < 0.05 &&
      Math.abs(cut.heightM - preset.heightM) < 0.05;
    if (matchesPreset) {
      params.delete("wm");
      params.delete("hm");
    } else {
      params.set("wm", trimM(cut.widthM));
      params.set("hm", trimM(cut.heightM));
    }
  } else {
    params.delete("shape");
    params.delete("a3scale");
    params.delete("a3ori");
    params.delete("wm");
    params.delete("hm");
    params.set("km", trimKm(frame.sideKm));
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function siteAnchorFromSearch(search: string): LonLat | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const lat = readCoordinate(params.get("siteLat"), -90, 90);
  const lon = readCoordinate(params.get("siteLon"), -180, 180);
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

export function writeSiteAnchorSearch(search: string, anchor: LonLat | null): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (anchor) {
    params.set("siteLat", trimCoord(anchor.lat));
    params.set("siteLon", trimCoord(anchor.lon));
  } else {
    params.delete("siteLat");
    params.delete("siteLon");
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}
