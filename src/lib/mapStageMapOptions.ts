import type { Map as MapLibreMap, MapOptions } from "maplibre-gl";

/** Constructor options that keep the landing map flat and north-up. */
export const FLAT_NORTH_UP_MAP_OPTIONS = {
  maxPitch: 0,
  pitch: 0,
  bearing: 0,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  touchZoomRotate: true,
} as const satisfies Partial<MapOptions>;

/** Disable rotation gestures while keeping pinch zoom and keyboard pan/zoom. */
export function applyFlatNorthUpMapHandlers(map: MapLibreMap): void {
  map.dragRotate.disable();
  map.touchPitch.disable();
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();

  const clampNorthUp = () => {
    if (map.getPitch() !== 0) map.setPitch(0);
    if (map.getBearing() !== 0) map.setBearing(0);
  };
  map.on("rotate", clampNorthUp);
  map.on("pitch", clampNorthUp);
  map.on("moveend", clampNorthUp);
}
