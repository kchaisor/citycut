import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { events as createPointerEvents, useFrame, useThree } from "@react-three/fiber";
import type { EventManager, RootState } from "@react-three/fiber";
import * as THREE from "three";
import { themeColor } from "../lib/themeColor";
import { markScreenOnly } from "../lib/screenOnly";

export function StudioSky({ colourTick, fallback }: { colourTick: number; fallback: string }) {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const previous = scene.background;
    scene.background = null;
    gl.setClearColor(new THREE.Color(themeColor("--viewport-bg", fallback)), 0);
    return () => {
      if (scene.background === null) scene.background = previous;
    };
  }, [scene, gl, colourTick, fallback]);
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
  // Floor grid only in the 3D perspective / isometric views: hidden whenever the camera looks
  // (near) straight down, as in Plan north and the top-down site-plan framing, so plan-type
  // views never show it.
  const forward = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    camera.getWorldDirection(forward);
    const fade = THREE.MathUtils.clamp((forward.y + 0.96) / 0.22, 0, 1);
    object.visible = fade > 0.01;
    (object.material as THREE.LineBasicMaterial).opacity = 0.9 * fade;
  });
  useEffect(() => () => {
    object.geometry.dispose();
    (object.material as THREE.Material).dispose();
  }, [object]);
  // Half a metre below the lowest ground of the cut: under the terrain drape and site base.
  return <primitive object={object} position={[0, groundY - 0.5, 0]} />;
}

/**
 * Floating mock: the canvas runs full width under the floating sidebar. R3F still sizes and
 * frames against the visible area right of the controls (the .fill box), so every fit, zoom
 * and camera position/target is exactly what it was. The drawing buffer is widened to the
 * left by the sidebar width and the camera gets a projection view offset of the same amount,
 * which adds the extra strip without moving or rescaling anything.
 */
export function ViewInset() {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const inset = useRef(0);
  useLayoutEffect(() => {
    const canvas = gl.domElement;
    const fill = canvas.closest(".fill");
    const viewport = canvas.closest(".viewport");
    const left = fill && viewport ? fill.getBoundingClientRect().left - viewport.getBoundingClientRect().left : 0;
    const p = Math.max(0, Math.round(left));
    inset.current = p;
    gl.setSize(size.width + p, size.height, true);
    canvas.style.marginLeft = p ? `${-p}px` : "";
    invalidate();
  }, [gl, size.width, size.height, invalidate]);
  useFrame(({ camera, size: s }) => {
    const p = inset.current;
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const v = cam.view;
    if (!p) {
      if (v?.enabled) cam.clearViewOffset();
      return;
    }
    if (v?.enabled && v.fullWidth === s.width && v.fullHeight === s.height && v.offsetX === -p && v.width === s.width + p) return;
    cam.setViewOffset(s.width, s.height, -p, 0, s.width + p, s.height);
  });
  return null;
}

/** Pointer events against the full-width canvas, so raycasts match the offset projection. */
export function insetPointerEvents(store: Parameters<typeof createPointerEvents>[0]): EventManager<HTMLElement> {
  const base = createPointerEvents(store);
  return {
    ...base,
    compute(event: { offsetX: number; offsetY: number }, state: RootState) {
      const canvas = state.gl.domElement;
      const w = canvas.clientWidth || state.size.width;
      const h = canvas.clientHeight || state.size.height;
      state.pointer.set((event.offsetX / w) * 2 - 1, -(event.offsetY / h) * 2 + 1);
      state.raycaster.setFromCamera(state.pointer, state.camera);
    },
  };
}
