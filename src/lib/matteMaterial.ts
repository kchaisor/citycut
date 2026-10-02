import * as THREE from "three";

/** Diffuse-only city surfaces: no specular sheen or environment reflections. */
export function matteStandardMaterial(
  params: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    ...params,
    roughness: 1,
    metalness: 0,
  });
  applyMatteFinish(material);
  return material;
}

export function applyMatteFinish(material: THREE.MeshStandardMaterial): void {
  material.roughness = 1;
  material.metalness = 0;
  material.envMap = null;
  material.envMapIntensity = 0;
  const extended = material as THREE.MeshStandardMaterial & {
    specularIntensity?: number;
    clearcoat?: number;
    sheen?: number;
  };
  if (extended.specularIntensity !== undefined) extended.specularIntensity = 0;
  if (extended.clearcoat !== undefined) extended.clearcoat = 0;
  if (extended.sheen !== undefined) extended.sheen = 0;
  material.needsUpdate = true;
}
