import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { cameraForExportFrame } from "./exportFrame";

describe("export camera ignores the on-screen view offset", () => {
  for (const make of [
    () => new THREE.PerspectiveCamera(35, 1000 / 900, 1, 10000),
    () => new THREE.OrthographicCamera(-500, 500, 450, -450, 1, 10000),
  ]) {
    it(make().type, () => {
      const plain = make();
      const offset = make();
      offset.setViewOffset(1000, 900, -380, 0, 1380, 900);
      expect(offset.projectionMatrix.equals(plain.projectionMatrix)).toBe(false);
      const a = cameraForExportFrame(plain, 1440, 900);
      const b = cameraForExportFrame(offset, 1440, 900);
      expect(b.view === null || b.view.enabled === false).toBe(true);
      expect(b.projectionMatrix.elements).toEqual(a.projectionMatrix.elements);
      expect(offset.view?.enabled).toBe(true);
    });
  }
});
