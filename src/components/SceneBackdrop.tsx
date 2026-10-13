import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { themeColor } from "../lib/themeColor";
import { markScreenOnly } from "../lib/screenOnly";

/**
 * Screen-space vertical gradient sky for the 3D view (light grey top to cool grey bottom).
 * A small canvas texture as scene.background, so the camera and picking are untouched.
 * PNG export swaps scene.background for its flat backdrop (capturePng), so downloads keep it.
 */
export function GradientSky({ colourTick, fallback }: { colourTick: number; fallback: string }) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const top = themeColor("--model-grad-top", fallback);
    const bottom = themeColor("--model-grad-bottom", fallback);
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const previous = scene.background;
    if (!ctx) {
      scene.background = new THREE.Color(fallback);
      return () => {
        scene.background = previous;
      };
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    return () => {
      if (scene.background === texture) scene.background = previous;
      texture.dispose();
    };
  }, [scene, colourTick, fallback]);
  return null;
}

/** Spacing of the ground grid (m) and how far it reaches past the cut, in cut widths. */
const GRID_STEP_M = 50;
const GRID_REACH = 4;

/**
 * A thin grid plane under and around the site, fading with distance. It sits just below the
 * lowest ground (no z-fighting), shows past the cut edges, and is screen-only: hidden in PNG
 * exports, and never part of the .3dm or .ai (those are built from the model, not the scene).
 */
export function GroundGrid({ sideM, groundY, colourTick }: { sideM: number; groundY: number; colourTick: number }) {
  const object = useMemo(() => {
    const reach = sideM * GRID_REACH;
    const step = GRID_STEP_M * Math.max(1, Math.round(sideM / 1000));
    const n = Math.ceil(reach / step);
    const fadeStart = sideM * 0.5;
    const colour = new THREE.Color(themeColor("--model-grid-line", "currentColor"));
    const positions: number[] = [];
    const colours: number[] = [];
    const alphaAt = (x: number, z: number) => {
      const r = Math.hypot(x, z);
      return r <= fadeStart ? 1 : Math.max(0, 1 - (r - fadeStart) / (reach - fadeStart));
    };
    const seg = 24;
    for (let i = -n; i <= n; i++) {
      const c = i * step;
      for (const axis of [0, 1]) {
        for (let k = 0; k < seg; k++) {
          const a = -reach + (2 * reach * k) / seg;
          const b = -reach + (2 * reach * (k + 1)) / seg;
          const p1 = axis ? [c, a] : [a, c];
          const p2 = axis ? [c, b] : [b, c];
          positions.push(p1[0]!, 0, p1[1]!, p2[0]!, 0, p2[1]!);
          for (const p of [p1, p2]) colours.push(colour.r, colour.g, colour.b, alphaAt(p[0]!, p[1]!));
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 4));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9 });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = "Ground grid";
    lines.renderOrder = -1;
    lines.raycast = () => {};
    markScreenOnly(lines);
    return lines;
  }, [sideM, colourTick]);
  useEffect(() => () => {
    object.geometry.dispose();
    (object.material as THREE.Material).dispose();
  }, [object]);
  // Half a metre below the lowest ground of the cut: under the terrain drape and site base.
  return <primitive object={object} position={[0, groundY - 0.5, 0]} />;
}
