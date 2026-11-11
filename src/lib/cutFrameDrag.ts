import { M_PER_DEG_LAT, mPerDegLon } from "./geo";
import { MAX_SIDE_KM, MIN_SIDE_KM } from "../content/constants";
import type { LonLat } from "../types";
import { a3RatioLockedDrag, type CutOrientation } from "./cutSpec";

export type CutFrameHandle = "nw" | "ne" | "sw" | "se";

const MIN_SIDE_M = MIN_SIDE_KM * 1000;
const MAX_SIDE_M = MAX_SIDE_KM * 1000;
const A3_MAX_WIDTH_FACTOR = 2.1;

export function oppositeCutHandle(handle: CutFrameHandle): CutFrameHandle {
  if (handle === "nw") return "se";
  if (handle === "se") return "nw";
  if (handle === "ne") return "sw";
  return "ne";
}

export function cutHandleCursor(handle: CutFrameHandle): "nwse-resize" | "nesw-resize" {
  return handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize";
}

export function fixedCornerForHandle(center: LonLat, sideM: number, dragged: CutFrameHandle): LonLat {
  const fixed = oppositeCutHandle(dragged);
  const half = sideM / 2;
  const dLon = half / mPerDegLon(center.lat);
  const dLat = half / M_PER_DEG_LAT;
  if (fixed === "nw") return { lon: center.lon - dLon, lat: center.lat + dLat };
  if (fixed === "ne") return { lon: center.lon + dLon, lat: center.lat + dLat };
  if (fixed === "sw") return { lon: center.lon - dLon, lat: center.lat - dLat };
  return { lon: center.lon + dLon, lat: center.lat - dLat };
}

export function fixedCornerForHandleRect(
  center: LonLat,
  widthM: number,
  heightM: number,
  dragged: CutFrameHandle,
): LonLat {
  const fixed = oppositeCutHandle(dragged);
  const halfW = widthM / 2;
  const halfH = heightM / 2;
  const dLon = halfW / mPerDegLon(center.lat);
  const dLat = halfH / M_PER_DEG_LAT;
  if (fixed === "nw") return { lon: center.lon - dLon, lat: center.lat + dLat };
  if (fixed === "ne") return { lon: center.lon + dLon, lat: center.lat + dLat };
  if (fixed === "sw") return { lon: center.lon - dLon, lat: center.lat - dLat };
  return { lon: center.lon + dLon, lat: center.lat - dLat };
}

function spansFromFixed(fixed: CutFrameHandle, fixedPt: LonLat, draggedPt: LonLat): { eastM: number; northM: number } {
  const mLon = mPerDegLon(fixedPt.lat);
  if (fixed === "nw") {
    return {
      eastM: (draggedPt.lon - fixedPt.lon) * mLon,
      northM: (fixedPt.lat - draggedPt.lat) * M_PER_DEG_LAT,
    };
  }
  if (fixed === "se") {
    return {
      eastM: (fixedPt.lon - draggedPt.lon) * mLon,
      northM: (draggedPt.lat - fixedPt.lat) * M_PER_DEG_LAT,
    };
  }
  if (fixed === "ne") {
    return {
      eastM: (draggedPt.lon - fixedPt.lon) * mLon,
      northM: (draggedPt.lat - fixedPt.lat) * M_PER_DEG_LAT,
    };
  }
  return {
    eastM: (fixedPt.lon - draggedPt.lon) * mLon,
    northM: (fixedPt.lat - draggedPt.lat) * M_PER_DEG_LAT,
  };
}

function centerFromFixed(fixed: CutFrameHandle, fixedPt: LonLat, sideM: number): LonLat {
  const half = sideM / 2;
  const mLon = mPerDegLon(fixedPt.lat);
  if (fixed === "nw") {
    return { lon: fixedPt.lon + half / mLon, lat: fixedPt.lat - half / M_PER_DEG_LAT };
  }
  if (fixed === "se") {
    return { lon: fixedPt.lon - half / mLon, lat: fixedPt.lat + half / M_PER_DEG_LAT };
  }
  if (fixed === "ne") {
    return { lon: fixedPt.lon - half / mLon, lat: fixedPt.lat - half / M_PER_DEG_LAT };
  }
  return { lon: fixedPt.lon + half / mLon, lat: fixedPt.lat + half / M_PER_DEG_LAT };
}

export function clampCutSideM(sideM: number): number {
  return Math.min(MAX_SIDE_M, Math.max(MIN_SIDE_M, sideM));
}

export function squareCutFromCornerDrag(
  fixed: CutFrameHandle,
  fixedPt: LonLat,
  draggedPt: LonLat,
): { center: LonLat; sideM: number } {
  const { eastM, northM } = spansFromFixed(fixed, fixedPt, draggedPt);
  const sideM = clampCutSideM(Math.max(eastM, northM));
  const center = centerFromFixed(fixed, fixedPt, sideM);
  return { center, sideM };
}

export function parseCutFrameHandle(className: string): CutFrameHandle | null {
  if (className.includes("frame-handle-se") || className.includes("is-br")) return "se";
  if (className.includes("frame-handle-sw") || className.includes("is-bl")) return "sw";
  if (className.includes("frame-handle-ne") || className.includes("is-tr")) return "ne";
  if (className.includes("frame-handle-nw") || className.includes("is-tl")) return "nw";
  return null;
}

function centerFromFixedRect(
  fixed: CutFrameHandle,
  fixedPt: LonLat,
  widthM: number,
  heightM: number,
): LonLat {
  const halfW = widthM / 2;
  const halfH = heightM / 2;
  const mLon = mPerDegLon(fixedPt.lat);
  if (fixed === "nw") {
    return { lon: fixedPt.lon + halfW / mLon, lat: fixedPt.lat - halfH / M_PER_DEG_LAT };
  }
  if (fixed === "se") {
    return { lon: fixedPt.lon - halfW / mLon, lat: fixedPt.lat + halfH / M_PER_DEG_LAT };
  }
  if (fixed === "ne") {
    return { lon: fixedPt.lon - halfW / mLon, lat: fixedPt.lat - halfH / M_PER_DEG_LAT };
  }
  return { lon: fixedPt.lon + halfW / mLon, lat: fixedPt.lat + halfH / M_PER_DEG_LAT };
}

export function a3CutFromCornerDrag(
  fixed: CutFrameHandle,
  fixedPt: LonLat,
  draggedPt: LonLat,
  orientation: CutOrientation,
): { center: LonLat; widthM: number; heightM: number; sideM: number } {
  const { eastM, northM } = spansFromFixed(fixed, fixedPt, draggedPt);
  const locked = a3RatioLockedDrag(Math.max(eastM, MIN_SIDE_M), Math.max(northM, MIN_SIDE_M), orientation);
  const widthM = Math.min(MAX_SIDE_M * A3_MAX_WIDTH_FACTOR, Math.max(MIN_SIDE_M, locked.widthM));
  const heightM = Math.min(MAX_SIDE_M, Math.max(MIN_SIDE_M, locked.heightM));
  const center = centerFromFixedRect(fixed, fixedPt, widthM, heightM);
  return { center, widthM, heightM, sideM: Math.max(widthM, heightM) };
}
