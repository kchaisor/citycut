import * as THREE from "three";

export type SectionKnifePose = {
  angleRad: number;
  offsetM: number;
};

export function defaultSectionKnifePose(sideM: number): SectionKnifePose {
  return { angleRad: 0, offsetM: sideM * 0.08 };
}

export function knifeNormalXZ(pose: SectionKnifePose): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(pose.angleRad), 0, Math.sin(pose.angleRad));
}

export function knifePlane(pose: SectionKnifePose): THREE.Plane {
  const normal = knifeNormalXZ(pose);
  return new THREE.Plane(normal, -pose.offsetM);
}

export function knifePlaneInverted(pose: SectionKnifePose): THREE.Plane {
  const plane = knifePlane(pose);
  return plane.clone().negate();
}

export function poseFromPlane(plane: THREE.Plane): SectionKnifePose {
  const n = plane.normal;
  const len = Math.hypot(n.x, n.z);
  const angleRad = len > 1e-6 ? Math.atan2(n.z / len, n.x / len) : 0;
  return { angleRad, offsetM: -plane.constant };
}

export function planeCutRect(pose: SectionKnifePose, halfExtent: number, groundY: number, topY: number): THREE.Vector3[] {
  const normal = knifeNormalXZ(pose);
  const tangent = new THREE.Vector3(-normal.z, 0, normal.x);
  const origin = normal.clone().multiplyScalar(pose.offsetM);
  const corners: THREE.Vector3[] = [];
  for (const sy of [groundY, topY]) {
    for (const t of [-halfExtent, halfExtent]) {
      const p = origin.clone().add(tangent.clone().multiplyScalar(t));
      p.y = sy;
      corners.push(p);
    }
  }
  return corners;
}

export function projectOntoSectionAxis(pose: SectionKnifePose, east: number, northSceneZ: number): number {
  const normal = knifeNormalXZ(pose);
  return east * normal.x + northSceneZ * normal.z;
}
