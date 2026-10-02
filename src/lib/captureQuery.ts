/** Query params for reproducible review captures (Kelvin water bug, etc.). */

export type CapturePreset = {
  uniformBuildings: boolean;
  solarPath: boolean;
};

export function capturePresetFromSearch(search: string): CapturePreset {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    uniformBuildings: params.get("buildings") === "uniform",
    solarPath: params.get("solar") === "path",
  };
}

/** Carlton Gardens frame matching Kelvin's exhibition-building screenshot. */
export const KELVIN_WATER_CAPTURE_SEARCH =
  "?lat=-37.8047&lon=144.9712&km=1&label=Carlton%20Gardens&view=iso-ne&solar=path&buildings=uniform";
