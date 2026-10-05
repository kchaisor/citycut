/** Query params for reproducible review captures (Kelvin water bug, etc.). */

export type CapturePreset = {
  uniformBuildings: boolean;
  solarPath: boolean;
};

/** Perspective camera pose in scene units: position then look-at target. */
export type CaptureCamera = {
  position: [number, number, number];
  target: [number, number, number];
};

export function capturePresetFromSearch(search: string): CapturePreset {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    uniformBuildings: params.get("buildings") === "uniform",
    solarPath: params.get("solar") === "path",
  };
}

/**
 * Read `cam=px,py,pz,tx,ty,tz` from a query string.
 * Invalid or incomplete values are ignored.
 */
export function cameraFromSearch(search: string): CaptureCamera | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("cam");
  if (!raw) return null;
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 6 || parts.some((value) => !Number.isFinite(value))) return null;
  return {
    position: [parts[0], parts[1], parts[2]],
    target: [parts[3], parts[4], parts[5]],
  };
}

function trimCam(value: number): string {
  const text = value.toFixed(3).replace(/\.?0+$/, "");
  return text === "-0" ? "0" : text;
}

/** `cam=` query value for the current perspective pose. */
export function formatCameraSearch(
  position: [number, number, number],
  target: [number, number, number],
): string {
  return `cam=${[...position, ...target].map(trimCam).join(",")}`;
}

/** Carlton Gardens frame matching Kelvin's exhibition-building screenshot. */
export const KELVIN_WATER_CAPTURE_SEARCH =
  "?lat=-37.8047&lon=144.9712&km=1&label=Carlton%20Gardens&view=iso-ne&solar=path&buildings=uniform";
