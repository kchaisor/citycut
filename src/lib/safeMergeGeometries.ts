import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export function safeMergeGeometries(
  parts: THREE.BufferGeometry[],
  useGroups = false,
  disposeSourcesOnSuccess = true,
): THREE.BufferGeometry | null {
  const usable = parts.filter((geometry) => geometry?.getAttribute("position"));
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0]!;
  try {
    const merged = mergeGeometries(usable, useGroups);
    if (!merged) return null;
    if (disposeSourcesOnSuccess) {
      for (const geometry of usable) geometry.dispose();
    }
    return merged;
  } catch {
    return null;
  }
}
