import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { useFrame, useThree } from "@react-three/fiber";
import { getColour } from "../lib/colours";
import {
  DIAL_PLANE_EPSILON_M,
  HELIODON_LIFT_M,
  dialPoint,
  flatDialGround,
  heliodonPoint,
  horizonArcDirections,
  type GroundHeight,
} from "../lib/heliodonGeometry";
import { sunDomeRadiusM } from "../lib/heliodonRadius";
import {
  SUN_DOME_BEARING_SIZE_PX,
  SUN_DOME_CARDINAL_SIZE_PX,
  SUN_DOME_HALO_PX,
  SUN_DOME_HORIZON_LINE,
  SUN_DOME_HOUR_LINE,
  SUN_DOME_KEY_DATES,
  SUN_DOME_LABEL_GAP_PX,
  SUN_DOME_SUN_LINE,
  SUN_DOME_SUN_PX,
  SUN_DOME_TICK_PX,
  SUN_DOME_TICK_STEP_DEG,
  sunDomeArcs,
  sunDomeBearingLabels,
  sunDomeHourLabel,
  sunDomeSunLinePositions,
  type ScreenRect,
  type SunDomeLineStyle,
} from "../lib/heliodonSunDome";
import { heliodonPalette } from "../lib/heliodonPalette";
import { meanTerrainElevation } from "../lib/terrain";
import { themeColor } from "../lib/themeColor";
import type { TerrainField } from "../types";
import { markScreenOnly } from "../lib/screenOnly";
import { moveToPostOverlay, retainPostOverlay, setPostOverlayDeferred } from "../lib/postOverlay";
import { useColourRevision } from "../lib/useColourRevision";
import {
  daylightHourMarks,
  melbourneLocalToUtc,
  sunSample,
  type SolarSample,
  type Vec3,
} from "../lib/solar";
import type { SunHoursWindow } from "../lib/sunHoursWindow";

export type SolarViewSettings = {
  showPath: boolean;
  castShadows: boolean;
  radiusFactor: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  sunStudy?: boolean;
  sunStudyMuted?: boolean;
  sunStudyCasters?: "all" | "selected";
  sunHours?: boolean;
  sunHoursWindow?: SunHoursWindow;
  sunHoursPickedOnly?: boolean;
};

const OVERLAY_ORDER = 1000;
const GHOST_OPACITY = 0.38;

const vec = (point: Vec3) => new THREE.Vector3(point[0], point[1], point[2]);

type DomeInk = { ink: string; ink2: string; ink3: string; accent: string; halo: string; sans: string; mono: string; scale: number };

function domeInk(pixelRatio: number): DomeInk {
  const root = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  return {
    ink: themeColor("--ink", getColour("--sun-compass-label")),
    ink2: themeColor("--ink-2", getColour("--sun-compass")),
    ink3: themeColor("--ink-3", getColour("--sun-compass")),
    accent: themeColor("--accent", getColour("--sun-marker")),
    halo: themeColor("--bg-elev", heliodonPalette().halo),
    sans: root?.getPropertyValue("--sans").trim() || "sans-serif",
    mono: root?.getPropertyValue("--mono").trim() || "monospace",
    scale: Math.max(1, pixelRatio),
  };
}

type DomeLine = { material: LineMaterial; dashPx: readonly [number, number] | null };

type DomeSprite = THREE.Sprite & { userData: { sizePx: [number, number] } };

const LABEL_PRIORITY = { hour: 0, date: 1, cardinal: 2, bearing: 3 } as const;

type DomeLabel = {
  sprite: DomeSprite;
  anchor: THREE.Vector3;
  outward: THREE.Vector3;
  gapPx: number;
  priority: number;
};

type DomeTicks = { geometry: LineSegmentsGeometry; radius: number; ground: GroundHeight; wpp: number };

type DomeRoot = THREE.Group & {
  userData: { lines: DomeLine[]; labels: DomeLabel[]; ticks: DomeTicks | null };
};

function lineMaterial(root: DomeRoot, style: SunDomeLineStyle, ink: DomeInk, opacity = style.opacity): LineMaterial {
  const material = new LineMaterial({
    color: style.ink === "--ink" ? ink.ink : ink.ink3,
    linewidth: style.widthPx,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    dashed: Boolean(style.dashPx),
    dashSize: style.dashPx?.[0] ?? 1,
    gapSize: style.dashPx?.[1] ?? 0,
  });
  material.toneMapped = false;
  root.userData.lines.push({ material, dashPx: style.dashPx });
  return material;
}

function addLine(root: DomeRoot, geometry: LineSegmentsGeometry, style: SunDomeLineStyle, ink: DomeInk, order: number) {
  const visible = new LineSegments2(geometry, lineMaterial(root, style, ink));
  const hidden = new LineSegments2(geometry, lineMaterial(root, style, ink, Math.min(style.opacity * GHOST_OPACITY, 0.99)));
  hidden.material.depthFunc = THREE.GreaterDepth;
  for (const [lines, renderOrder] of [[visible, order], [hidden, order + 20]] as const) {
    if (style.dashPx) lines.computeLineDistances();
    lines.renderOrder = renderOrder;
    lines.frustumCulled = false;
    root.add(lines);
  }
}

function segmentsGeometry(polylines: Vec3[][]): LineSegmentsGeometry | null {
  const positions: number[] = [];
  for (const points of polylines) {
    for (let i = 1; i < points.length; i++) positions.push(...points[i - 1]!, ...points[i]!);
  }
  if (positions.length === 0) return null;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  return geometry;
}

function crispTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function labelSprite(
  text: string,
  options: { font: string; sizePx: number; weight: number; colour: string; halo: string; scale: number; letterSpacingEm?: number },
): DomeSprite {
  const scale = options.scale;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const fontSpec = `${options.weight} ${options.sizePx * scale}px ${options.font}`;
  const spacing = `${(options.letterSpacingEm ?? 0) * options.sizePx * scale}px`;
  const pad = SUN_DOME_HALO_PX * scale;
  if (context) {
    context.font = fontSpec;
    context.letterSpacing = spacing;
    canvas.width = Math.ceil(context.measureText(text).width + pad * 2);
    canvas.height = Math.ceil(options.sizePx * 1.25 * scale + pad * 2);
    context.font = fontSpec;
    context.letterSpacing = spacing;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    context.lineWidth = SUN_DOME_HALO_PX * 2 * scale;
    context.strokeStyle = options.halo;
    context.strokeText(text, canvas.width / 2, canvas.height / 2);
    context.fillStyle = options.colour;
    context.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: crispTexture(canvas), depthTest: false, depthWrite: false, toneMapped: false }),
  ) as DomeSprite;
  sprite.renderOrder = OVERLAY_ORDER + 40;
  sprite.frustumCulled = false;
  sprite.userData.sizePx = [canvas.width / scale, canvas.height / scale];
  return sprite;
}

function addLabel(root: DomeRoot, label: DomeLabel) {
  label.sprite.position.copy(label.anchor);
  root.userData.labels.push(label);
  root.add(label.sprite);
}

function sunDotSprite(ink: DomeInk): DomeSprite {
  const scale = ink.scale;
  const size = SUN_DOME_SUN_PX + 2;
  const canvas = document.createElement("canvas");
  canvas.width = size * scale;
  canvas.height = size * scale;
  const context = canvas.getContext("2d");
  if (context) {
    context.beginPath();
    context.arc(canvas.width / 2, canvas.height / 2, ((SUN_DOME_SUN_PX - 1) / 2) * scale, 0, Math.PI * 2);
    context.fillStyle = ink.accent;
    context.fill();
    context.lineWidth = scale;
    context.strokeStyle = ink.ink;
    context.stroke();
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: crispTexture(canvas), depthTest: false, depthWrite: false, toneMapped: false }),
  ) as DomeSprite;
  sprite.renderOrder = OVERLAY_ORDER + 60;
  sprite.frustumCulled = false;
  sprite.userData.sizePx = [size, size];
  return sprite;
}

function circle(radius: number, ground: GroundHeight, stepDeg = 1): Vec3[] {
  const points: Vec3[] = [];
  for (let deg = 0; deg <= 360; deg += stepDeg) points.push(dialPoint(deg, radius, ground));
  return points;
}

function buildDial(root: DomeRoot, ink: DomeInk, radius: number, ground: GroundHeight) {
  const ring = segmentsGeometry([circle(radius, ground)]);
  if (ring) addLine(root, ring, SUN_DOME_HORIZON_LINE, ink, OVERLAY_ORDER - 10);
  const ticks = new LineSegmentsGeometry();
  ticks.setPositions([0, 0, 0, 0, 0, 0]);
  addLine(root, ticks, SUN_DOME_HORIZON_LINE, ink, OVERLAY_ORDER - 9);
  root.userData.ticks = { geometry: ticks, radius, ground, wpp: 0 };

  for (const label of sunDomeBearingLabels()) {
    const sprite = labelSprite(label.text, {
      font: ink.sans,
      sizePx: label.cardinal ? SUN_DOME_CARDINAL_SIZE_PX : SUN_DOME_BEARING_SIZE_PX,
      weight: 700,
      colour: label.cardinal ? ink.ink : ink.ink3,
      halo: ink.halo,
      scale: ink.scale,
      letterSpacingEm: 0.08,
    });
    const anchor = vec(dialPoint(label.deg, radius, ground));
    addLabel(root, {
      sprite,
      anchor,
      outward: anchor.clone().setY(0).normalize(),
      gapPx: SUN_DOME_TICK_PX + SUN_DOME_TICK_PX,
      priority: label.cardinal ? LABEL_PRIORITY.cardinal : LABEL_PRIORITY.bearing,
    });
  }
}

function buildSunPaths(
  root: DomeRoot,
  ink: DomeInk,
  lat: number,
  lon: number,
  year: number,
  selected: { month: number; day: number },
  radius: number,
  ground: GroundHeight,
  centre: THREE.Vector3,
) {
  const onDome = (direction: Vec3) => heliodonPoint(direction, radius, ground);
  const outwardOf = (point: THREE.Vector3) => point.clone().sub(centre).normalize();
  for (const arc of sunDomeArcs(selected)) {
    const points = horizonArcDirections(lat, lon, year, arc.month, arc.day, 5).map(onDome);
    const geometry = segmentsGeometry([points]);
    if (!geometry) continue;
    addLine(root, geometry, arc.line, ink, OVERLAY_ORDER + (arc.selected ? 4 : 1));

    if (arc.dateLabel) {
      const sunset = vec(points[points.length - 1]!);
      addLabel(root, {
        sprite: labelSprite(arc.dateLabel, { font: ink.sans, sizePx: 11, weight: 500, colour: ink.ink2, halo: ink.halo, scale: ink.scale }),
        anchor: sunset,
        outward: outwardOf(sunset).setY(0).normalize(),
        gapPx: SUN_DOME_LABEL_GAP_PX,
        priority: LABEL_PRIORITY.date,
      });
    }
    for (const mark of daylightHourMarks(lat, lon, year, arc.month, arc.day)) {
      if (!arc.hourLabels.includes(mark.hour)) continue;
      const at = vec(onDome(mark.sample.direction));
      addLabel(root, {
        sprite: labelSprite(sunDomeHourLabel(mark.hour), { font: ink.mono, sizePx: 11, weight: 600, colour: ink.ink, halo: ink.halo, scale: ink.scale }),
        anchor: at,
        outward: outwardOf(at),
        gapPx: SUN_DOME_LABEL_GAP_PX,
        priority: LABEL_PRIORITY.hour,
      });
    }
  }

  const hourDirections = new Map<number, Vec3[]>();
  for (const key of SUN_DOME_KEY_DATES) {
    for (const mark of daylightHourMarks(lat, lon, year, key.date.month, key.date.day)) {
      const list = hourDirections.get(mark.hour) ?? [];
      list.push(mark.sample.direction);
      hourDirections.set(mark.hour, list);
    }
  }
  const hourLines: Vec3[][] = [];
  for (const directions of hourDirections.values()) {
    if (directions.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(directions.map(vec), false, "centripetal");
    hourLines.push(curve.getPoints(directions.length * 12).map((point) => onDome(point.normalize().toArray() as Vec3)));
  }
  const geometry = segmentsGeometry(hourLines);
  if (geometry) addLine(root, geometry, SUN_DOME_HOUR_LINE, ink, OVERLAY_ORDER - 5);
}

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const item of Array.isArray(material) ? material : material ? [material] : []) {
      (item as THREE.SpriteMaterial).map?.dispose();
      item.dispose();
    }
  });
  for (const geometry of geometries) geometry.dispose();
}

function useDisposable<T extends THREE.Object3D>(build: () => T, deps: readonly unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const object = useMemo(build, deps);
  useEffect(() => () => disposeTree(object), [object]);
  return object;
}

function useDomeFontsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fonts = typeof document === "undefined" ? null : document.fonts;
    if (!fonts?.load) return;
    let live = true;
    const root = getComputedStyle(document.documentElement);
    const sans = root.getPropertyValue("--sans").trim() || "sans-serif";
    const mono = root.getPropertyValue("--mono").trim() || "monospace";
    Promise.all([fonts.load(`700 10px ${sans}`), fonts.load(`500 11px ${sans}`), fonts.load(`600 11px ${mono}`)])
      .then(() => {
        if (live) setTick((value) => value + 1);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return tick;
}

export function useMelbourneSunSample(lat: number, lon: number, settings: SolarViewSettings): SolarSample {
  const { year, month, day, hour, minute } = settings;
  return useMemo(
    () => sunSample(lat, lon, melbourneLocalToUtc(year, month, day, hour, minute)),
    [lat, lon, year, month, day, hour, minute],
  );
}

const scratch = {
  view: new THREE.Vector3(),
  ndc: new THREE.Vector3(),
  ahead: new THREE.Vector3(),
  world: new THREE.Vector3(),
};

function worldPerPixel(camera: THREE.Camera, at: THREE.Vector3, heightPx: number): number {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera;
    return (ortho.top - ortho.bottom) / (ortho.zoom * heightPx);
  }
  const persp = camera as THREE.PerspectiveCamera;
  const depth = Math.max(1e-3, -scratch.view.copy(at).applyMatrix4(persp.matrixWorldInverse).z);
  return (2 * depth * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2)) / (persp.zoom * heightPx);
}

type ScreenBox = { x: number; y: number; hw: number; hh: number };

function snapToPixel(centre: number, size: number, pixelRatio: number): number {
  return Math.round((centre - size / 2) * pixelRatio) / pixelRatio + size / 2;
}

function placeLabel(label: DomeLabel, camera: THREE.Camera, width: number, height: number, pixelRatio: number): ScreenBox | null {
  const [wPx, hPx] = label.sprite.userData.sizePx;
  const wpp = worldPerPixel(camera, label.anchor, height);
  label.sprite.scale.set(wPx * wpp, hPx * wpp, 1);
  const ndc = scratch.ndc.copy(label.anchor).project(camera);
  if (ndc.z > 1 || ndc.z < -1) return null;
  const anchorX = ((ndc.x + 1) / 2) * width;
  const anchorY = ((1 - ndc.y) / 2) * height;
  const ahead = scratch.ahead.copy(label.anchor).addScaledVector(label.outward, wpp * 20).project(camera);
  let dx = ((ahead.x + 1) / 2) * width - anchorX;
  let dy = ((1 - ahead.y) / 2) * height - anchorY;
  const length = Math.hypot(dx, dy);
  if (length < 1e-3) {
    dx = 0;
    dy = -1;
  } else {
    dx /= length;
    dy /= length;
  }
  const halo = SUN_DOME_HALO_PX;
  const reach = label.gapPx - halo + Math.abs(dx) * (wPx / 2) + Math.abs(dy) * (hPx / 2);
  const x = snapToPixel(anchorX + dx * reach, wPx, pixelRatio);
  const y = snapToPixel(anchorY + dy * reach, hPx, pixelRatio);
  label.sprite.position.copy(scratch.world.set((x / width) * 2 - 1, 1 - (y / height) * 2, ndc.z).unproject(camera));
  return { x, y, hw: wPx / 2 - halo, hh: hPx / 2 - halo };
}

function overlaps(a: ScreenBox, b: ScreenBox): boolean {
  return Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh;
}

function updateTicks(ticks: DomeTicks, camera: THREE.Camera, centre: THREE.Vector3, height: number) {
  const wpp = worldPerPixel(camera, centre, height);
  if (ticks.wpp > 0 && Math.abs(wpp / ticks.wpp - 1) < 0.01) return;
  ticks.wpp = wpp;
  const positions: number[] = [];
  for (let deg = 0; deg < 360; deg += SUN_DOME_TICK_STEP_DEG) {
    const from = dialPoint(deg, ticks.radius, ticks.ground);
    const length = SUN_DOME_TICK_PX * worldPerPixel(camera, scratch.world.set(from[0], from[1], from[2]), height);
    positions.push(...from, ...dialPoint(deg, ticks.radius + length, ticks.ground));
  }
  ticks.geometry.setPositions(positions);
}

function useSunDomeFrame(root: DomeRoot | null, sun: DomeSprite | null, centre: THREE.Vector3) {
  useFrame(({ camera, gl, size }) => {
    if (!root) return;
    const width = gl.domElement.clientWidth || size.width;
    const height = size.height;
    const wppCentre = worldPerPixel(camera, centre, height);
    for (const line of root.userData.lines) {
      line.material.resolution.set(width, height);
      if (line.dashPx) line.material.dashScale = 1 / wppCentre;
    }
    if (root.userData.ticks) updateTicks(root.userData.ticks, camera, centre, height);

    const placed: ScreenBox[] = [];
    if (sun) {
      const wpp = worldPerPixel(camera, sun.position, height);
      sun.scale.setScalar(sun.userData.sizePx[0] * wpp);
      const ndc = scratch.ndc.copy(sun.position).project(camera);
      placed.push({ x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height, hw: SUN_DOME_SUN_PX / 2 + 2, hh: SUN_DOME_SUN_PX / 2 + 2 });
    }
    for (const label of root.userData.labels) {
      const box = placeLabel(label, camera, width, height, gl.getPixelRatio());
      const free = box != null && !placed.some((other) => overlaps(box, other));
      label.sprite.visible = free;
      if (box && free) placed.push(box);
    }
  });
}


export function canvasScreenRect(canvas: HTMLCanvasElement): ScreenRect {
  const rect = canvas.getBoundingClientRect();
  const host = canvas.parentElement?.getBoundingClientRect() ?? rect;
  return { left: Math.max(rect.left, host.left), top: rect.top, right: Math.min(rect.right, host.right), bottom: rect.bottom };
}

export function liveHudRects(viewport: ScreenRect): ScreenRect[] {
  const rects: ScreenRect[] = [];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(".model .hud-card"))) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (rect.right <= viewport.left || rect.left >= viewport.right || rect.bottom <= viewport.top || rect.top >= viewport.bottom) continue;
    rects.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
  }
  return rects;
}

export function SolarHeliodon({
  lat,
  lon,
  sideM,
  groundY,
  terrain,
  settings,
  hideDiagram,
  radiusM,
}: {
  lat: number;
  lon: number;
  sideM: number;
  radiusM?: number;
  groundY: number;
  terrain?: TerrainField;
  settings: SolarViewSettings;
  hideDiagram?: boolean;
}) {
  const sample = useMelbourneSunSample(lat, lon, settings);
  const colourTick = useColourRevision();
  const fontsTick = useDomeFontsTick();
  const pixelRatio = useThree((state) => Math.ceil(state.viewport.dpr));
  const radius = radiusM ?? sunDomeRadiusM(sideM);
  const show = settings.showPath && !hideDiagram;
  const { year, month, day } = settings;
  const dialPlaneY = useMemo(
    () => (terrain ? meanTerrainElevation(terrain) : groundY) + DIAL_PLANE_EPSILON_M,
    [terrain, groundY],
  );
  const ground = useMemo<GroundHeight>(() => flatDialGround(dialPlaneY), [dialPlaneY]);
  const centre = useMemo(() => new THREE.Vector3(0, ground(0, 0) + HELIODON_LIFT_M, 0), [ground]);

  const root = useDisposable(() => {
    const group = new THREE.Group() as DomeRoot;
    group.name = "Heliodon";
    group.userData = { lines: [], labels: [], ticks: null };
    if (!show || typeof document === "undefined") return group;
    const ink = domeInk(pixelRatio);
    buildDial(group, ink, radius, ground);
    buildSunPaths(group, ink, lat, lon, year, { month, day }, radius, ground, centre);
    group.userData.labels.sort((a, b) => a.priority - b.priority);
    markScreenOnly(group);
    moveToPostOverlay(group);
    return group;
  }, [show, lat, lon, year, month, day, radius, ground, centre, colourTick, fontsTick, pixelRatio]);

  const marker = useDisposable(() => {
    const group = new THREE.Group();
    group.name = "Sun";
    if (typeof document === "undefined") return group;
    const ink = domeInk(pixelRatio);
    const dot = sunDotSprite(ink);
    const drop = new LineSegmentsGeometry();
    drop.setPositions([0, 0, 0, 0, 0, 0]);
    const material = new LineMaterial({
      color: ink.ink,
      linewidth: SUN_DOME_SUN_LINE.widthPx,
      depthWrite: false,
      transparent: true,
      dashed: true,
      dashSize: SUN_DOME_SUN_LINE.dashPx![0],
      gapSize: SUN_DOME_SUN_LINE.dashPx![1],
    });
    material.toneMapped = false;
    const line = new LineSegments2(drop, material);
    line.computeLineDistances();
    line.renderOrder = OVERLAY_ORDER + 50;
    line.frustumCulled = false;
    group.add(line, dot);
    group.userData = { dot, drop, line, material };
    markScreenOnly(group);
    moveToPostOverlay(group);
    return group;
  }, [colourTick, pixelRatio]);

  const sunAt = vec(heliodonPoint(sample.direction, radius, ground));
  const sunVisible = show && sample.aboveHorizon;
  const dot = (marker.userData.dot as DomeSprite | undefined) ?? null;
  useLayoutEffect(() => {
    const drop = marker.userData.drop as LineSegmentsGeometry | undefined;
    const line = marker.userData.line as LineSegments2 | undefined;
    dot?.position.copy(sunAt);
    drop?.setPositions(sunDomeSunLinePositions(sunAt, centre));
    line?.computeLineDistances();
  });
  marker.visible = sunVisible;

  useFrame(({ camera, gl, size }) => {
    const material = marker.userData.material as LineMaterial | undefined;
    material?.resolution.set(gl.domElement.clientWidth || size.width, size.height);
    if (material && SUN_DOME_SUN_LINE.dashPx) material.dashScale = 1 / worldPerPixel(camera, centre, size.height);
  });
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    if (!show) return;
    setPostOverlayDeferred(camera, false);
    return retainPostOverlay(scene);
  }, [show, scene, camera]);
  useSunDomeFrame(show ? root : null, sunVisible ? dot : null, centre);

  if (!show) return null;
  return (
    <>
      <primitive object={root} />
      <primitive object={marker} />
    </>
  );
}

export function SolarLight({
  sample,
  sideM,
  enabled,
  intensity = 2.35,
  targetY,
  topY,
}: {
  sample: SolarSample;
  sideM: number;
  enabled: boolean;
  intensity?: number;
  targetY: number;
  topY: number;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const on = enabled && sample.aboveHorizon;
  const [dx, dy, dz] = sample.direction;
  const reach = Math.hypot(sideM / 2, sideM / 2, Math.max(topY - targetY, 1));
  const distance = reach * 1.5;

  useLayoutEffect(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    markScreenOnly(light);
    target.position.set(0, targetY, 0);
    target.updateMatrixWorld();
    light.target = target;
    light.position.set(dx * distance, targetY + dy * distance, dz * distance);
    light.updateMatrixWorld();

    const camera = light.shadow.camera;
    camera.left = -reach;
    camera.right = reach;
    camera.top = reach;
    camera.bottom = -reach;
    camera.near = Math.max(0.5, distance - reach * 1.05);
    camera.far = distance + reach * 1.05;
    camera.updateProjectionMatrix();

    const texel = (2 * reach) / light.shadow.mapSize.width;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = texel * 1.2;
    light.shadow.radius = 2;
    light.shadow.needsUpdate = true;
  }, [dx, dy, dz, distance, reach, targetY, on]);

  return (
    <>
      <object3D ref={targetRef} />
      <directionalLight
        ref={lightRef}
        intensity={on ? intensity : 0}
        castShadow={on}
        shadow-mapSize={[2048, 2048]}
      />
    </>
  );
}
