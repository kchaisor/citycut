import * as THREE from "three";
import type { CityModel } from "../types";
import { groundWindHeightAt } from "./groundWindField";
import type { GroundWindScreenProject, GroundWindScreenUnproject } from "./groundWindParticles";

export function createGroundWindPerspectiveScreen(
  model: CityModel,
  viewW: number,
  viewH: number,
): {
  project: GroundWindScreenProject;
  unproject: GroundWindScreenUnproject;
  heightAt: (east: number, north: number) => number;
} {
  const heightAt = (east: number, north: number) => groundWindHeightAt(model, east, north);
  const camera = new THREE.PerspectiveCamera(45, viewW / viewH, 0.4, model.sideM * 24);
  const polar = 0.94;
  const azimuth = 0.58;
  const distance = model.sideM * 0.78;
  const targetY = heightAt(0, 0) + model.sideM * 0.02;
  camera.position.set(
    distance * Math.sin(polar) * Math.sin(azimuth),
    targetY + distance * Math.cos(polar),
    distance * Math.sin(polar) * Math.cos(azimuth),
  );
  camera.lookAt(0, targetY, 0);
  camera.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const hit = new THREE.Vector3();
  const proj = new THREE.Vector3();

  const unproject: GroundWindScreenUnproject = (screenX, screenY) => {
    const x = (screenX / viewW) * 2 - 1;
    const y = -(screenY / viewH) * 2 + 1;
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    let east = 0;
    let north = 0;
    let planeY = heightAt(0, 0);
    for (let step = 0; step < 5; step++) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      east = hit.x;
      north = -hit.z;
      planeY = heightAt(east, north);
    }
    const half = model.sideM / 2;
    if (east < -half || east > half || north < -half || north > half) return null;
    return { east, north };
  };

  const project: GroundWindScreenProject = (east, north, y) => {
    proj.set(east, y, -north);
    proj.project(camera);
    if (proj.z > 1) return null;
    return {
      x: ((proj.x + 1) / 2) * viewW,
      y: ((1 - proj.y) / 2) * viewH,
    };
  };

  return { project, unproject, heightAt };
}
