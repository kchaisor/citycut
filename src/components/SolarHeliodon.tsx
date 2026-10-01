import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import { getColour } from "../lib/colours";
import { heliodonPalette, type HeliodonPalette } from "../lib/heliodonPalette";
import { sampleTerrain } from "../lib/terrain";
import type { TerrainField } from "../types";
import { markScreenOnly } from "../lib/screenOnly";
import { useColourRevision } from "../lib/useColourRevision";
import {
  SOLAR_EQUINOX,
  SOLAR_SUMMER,
  SOLAR_WINTER,
  daylightArcSamples,
  daylightHourMarks,
  melbourneLocalToUtc,
  sunSample,
  type SolarSample,
  type Vec3,
} from "../lib/solar";

export type SolarViewSettings = {
  showPath: boolean;
  castShadows: boolean;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function sampleToPoint(direction: Vec3, radius: number, groundY: number): THREE.Vector3 {
  return new THREE.Vector3(direction[0] * radius, groundY + direction[1] * radius, direction[2] * radius);
}

/** Paint after the city so the heliodon sits over it. */
const OVERLAY_ORDER = 1000;

/** Dome radius as a fraction of the cut side. Sized so the summer arc stays in the default 3D frame. The dial's horizon ring has the same radius. */
export const HELIODON_DOME_FRACTION = 0.36;

/** Dash patterns as fractions of the cut side: on, off, on, off… `null` is a solid line. */
export const SUN_PATH_STYLES = [
  { date: SOLAR_SUMMER, label: "Dec 21", key: "--sun-arc-summer", pattern: null, labelSide: 1 },
  { date: SOLAR_EQUINOX, label: "Sep/Mar", key: "--sun-arc-equinox", pattern: [0.018, 0.011], labelSide: -1 },
  { date: SOLAR_WINTER, label: "Jun 21", key: "--sun-arc-winter", pattern: [0.024, 0.009, 0.004, 0.009], labelSide: -1 },
] as const;

const LABELLED_HOURS = new Set([6, 9, 12, 15, 18]);
/** Lift above the draped terrain so the dial does not z-fight with roads. */
const DIAL_LIFT_M = 1.5;
/** Opacity of the second pass that draws heliodon lines where buildings hide them. */
const GHOST_OPACITY = 0.2;

type Ground = (x: number, z: number) => number;

function visibleMaterial(color: string, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    depthWrite: false,
    toneMapped: false,
    transparent: opacity < 1,
    opacity,
  });
}

/** The flat dial is a plan overlay, so it paints over the city like the reference chart. */
function overlay<T extends THREE.Material>(material: T): T {
  material.depthTest = false;
  return material;
}

function ghostMaterial<T extends THREE.Material>(material: T, opacity = GHOST_OPACITY): T {
  const ghost = material.clone();
  ghost.depthFunc = THREE.GreaterDepth;
  ghost.depthWrite = false;
  ghost.transparent = true;
  ghost.opacity = material.opacity * opacity;
  return ghost;
}

/** Adds a visible pass and a ghosted pass that only paints where something is in front. */
function addTwoPass(group: THREE.Group, object: THREE.Mesh | THREE.LineSegments, order: number, ghost = true) {
  object.renderOrder = order;
  object.frustumCulled = false;
  group.add(object);
  if (!ghost) return;
  const hidden = object.clone();
  hidden.material = ghostMaterial(object.material as THREE.Material);
  hidden.renderOrder = order + 20;
  group.add(hidden);
}

function polylineTube(points: THREE.Vector3[], radius: number): THREE.TubeGeometry | null {
  if (points.length < 2) return null;
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 1; i < points.length; i++) path.add(new THREE.LineCurve3(points[i - 1], points[i]));
  return new THREE.TubeGeometry(path, Math.max(2, (points.length - 1) * 2), radius, 5, false);
}

/** A thin tube along `points`, cut into dashes when `pattern` (metres) is given. */
function strokeGeometry(points: THREE.Vector3[], radius: number, pattern: readonly number[] | null): THREE.BufferGeometry | null {
  if (!pattern) return polylineTube(points, radius);
  const pieces: THREE.BufferGeometry[] = [];
  let step = 0;
  let left = pattern[0];
  let current: THREE.Vector3[] = [points[0].clone()];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    let travelled = 0;
    const length = from.distanceTo(to);
    while (length - travelled > left) {
      travelled += left;
      const at = from.clone().lerp(to, travelled / length);
      if (step % 2 === 0) {
        current.push(at);
        const piece = polylineTube(current, radius);
        if (piece) pieces.push(piece);
      }
      current = [at.clone()];
      step += 1;
      left = pattern[step % pattern.length];
    }
    left -= length - travelled;
    if (step % 2 === 0) current.push(to.clone());
    else current = [to.clone()];
  }
  if (step % 2 === 0) {
    const piece = polylineTube(current, radius);
    if (piece) pieces.push(piece);
  }
  return mergeAndDispose(pieces);
}

function mergeAndDispose(pieces: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (pieces.length === 0) return null;
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  return merged;
}

/** One merged LineSegments buffer per line weight. */
class SegmentBatch {
  readonly positions: number[] = [];
  segment(a: THREE.Vector3, b: THREE.Vector3) {
    this.positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  polyline(points: THREE.Vector3[]) {
    for (let i = 1; i < points.length; i++) this.segment(points[i - 1], points[i]);
  }
  build(material: THREE.LineBasicMaterial | THREE.LineDashedMaterial): THREE.LineSegments | null {
    if (this.positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    const lines = new THREE.LineSegments(geometry, material);
    if ((material as THREE.LineDashedMaterial).isLineDashedMaterial) lines.computeLineDistances();
    return lines;
  }
}

function lineMaterial(color: string, opacity: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
}

function dashedLineMaterial(color: string, opacity: number, dash: number, gap: number): THREE.LineDashedMaterial {
  return new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize: dash,
    gapSize: gap,
    depthWrite: false,
    toneMapped: false,
  });
}

function canvasSprite(canvas: HTMLCanvasElement, order: number): THREE.Sprite {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = order;
  sprite.frustumCulled = false;
  return sprite;
}

function textSprite(
  text: string,
  options: { ink: string; halo: string; heightM: number; weight?: number },
): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const px = 64;
  const font = `${options.weight ?? 500} ${px}px system-ui, sans-serif`;
  context.font = font;
  const pad = 14;
  canvas.width = Math.ceil(context.measureText(text).width + pad * 2);
  canvas.height = px + pad * 2;
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 12;
  context.strokeStyle = options.halo;
  context.strokeText(text, canvas.width / 2, canvas.height / 2 + 3);
  context.fillStyle = options.ink;
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 3);
  const sprite = canvasSprite(canvas, OVERLAY_ORDER + 40);
  sprite.scale.set((options.heightM * canvas.width) / canvas.height, options.heightM, 1);
  return sprite;
}

function hourDotMaterial(ink: string, fill: string): THREE.SpriteMaterial | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.beginPath();
  context.arc(32, 32, 22, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = 9;
  context.strokeStyle = ink;
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false });
}

function sunIcon(core: string, casing: string): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.translate(128, 128);
  context.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    context.beginPath();
    context.moveTo(Math.cos(t) * 64, Math.sin(t) * 64);
    context.lineTo(Math.cos(t) * 110, Math.sin(t) * 110);
    context.lineWidth = 24;
    context.strokeStyle = casing;
    context.stroke();
    context.lineWidth = 12;
    context.strokeStyle = core;
    context.stroke();
  }
  context.beginPath();
  context.arc(0, 0, 54, 0, Math.PI * 2);
  context.fillStyle = casing;
  context.fill();
  context.beginPath();
  context.arc(0, 0, 47, 0, Math.PI * 2);
  context.fillStyle = core;
  context.fill();
  return canvasSprite(canvas, OVERLAY_ORDER + 60);
}

function disposeTree(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const item of Array.isArray(material) ? material : material ? [material] : []) {
      (item as THREE.SpriteMaterial).map?.dispose();
      item.dispose();
    }
  });
}

/** Holds a built Object3D and disposes its GPU resources when it is replaced or unmounted. */
function useDisposable<T extends THREE.Object3D>(build: () => T, deps: readonly unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const object = useMemo(build, deps);
  useEffect(() => () => disposeTree(object), [object]);
  return object;
}

export function useMelbourneSunSample(lat: number, lon: number, settings: SolarViewSettings): SolarSample {
  const { year, month, day, hour, minute } = settings;
  return useMemo(
    () => sunSample(lat, lon, melbourneLocalToUtc(year, month, day, hour, minute)),
    [lat, lon, year, month, day, hour, minute],
  );
}

/** A label that may sit at one of several spots, or hide when every spot collides. */
type MovableLabel = { sprite: THREE.Sprite; spots: THREE.Vector3[] };

type HeliodonRoot = THREE.Group & {
  userData: {
    cardinals: THREE.Sprite[];
    degreeLabels: THREE.Sprite[];
    movable: MovableLabel[];
  };
};

function dialPoint(ground: Ground, deg: number, radius: number): THREE.Vector3 {
  const t = (deg * Math.PI) / 180;
  const x = Math.sin(t) * radius;
  const z = -Math.cos(t) * radius;
  return new THREE.Vector3(x, ground(x, z) + DIAL_LIFT_M, z);
}

function dialCircle(ground: Ground, radius: number, stepDeg = 2): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let deg = 0; deg <= 360; deg += stepDeg) points.push(dialPoint(ground, deg, radius));
  return points;
}

function dialRay(ground: Ground, deg: number, from: number, to: number, steps = 24): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) points.push(dialPoint(ground, deg, from + ((to - from) * i) / steps));
  return points;
}

/** Flat annulus in the background colour behind the tick ring: the dial's casing. */
function tickBand(ground: Ground, inner: number, outer: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const steps = 180;
  for (let i = 0; i <= steps; i++) {
    const deg = (i / steps) * 360;
    for (const radius of [inner, outer]) {
      const point = dialPoint(ground, deg, radius);
      positions.push(point.x, point.y, point.z);
    }
    if (i < steps) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

function buildDial(root: HeliodonRoot, palette: HeliodonPalette, sideM: number, ground: Ground) {
  const R = sideM * HELIODON_DOME_FRACTION;
  const fine = new SegmentBatch();
  const medium = new SegmentBatch();
  const axes = new SegmentBatch();

  for (let alt = 10; alt < 90; alt += 10) fine.polyline(dialCircle(ground, R * Math.cos((alt * Math.PI) / 180)));
  const inner = R * Math.cos((80 * Math.PI) / 180);
  for (let deg = 0; deg < 360; deg += 10) {
    if (deg % 90 === 0) continue;
    (deg % 30 === 0 ? medium : fine).polyline(dialRay(ground, deg, inner, R));
  }
  for (const deg of [0, 90]) axes.polyline(dialRay(ground, deg + 180, R, 0, 40).concat(dialRay(ground, deg, 0, R, 40)));
  medium.polyline(dialCircle(ground, R + sideM * 0.03, 1));

  const majorTicks: THREE.BufferGeometry[] = [];
  for (let deg = 0; deg < 360; deg += 1) {
    const cardinal = deg % 90 === 0;
    if (deg % 10 === 0) {
      const length = sideM * (cardinal ? 0.045 : 0.03);
      const tick = polylineTube([dialPoint(ground, deg, R), dialPoint(ground, deg, R + length)], sideM * (cardinal ? 0.0016 : 0.0011));
      if (tick) majorTicks.push(tick);
    } else if (deg % 5 === 0) {
      medium.segment(dialPoint(ground, deg, R), dialPoint(ground, deg, R + sideM * 0.02));
    } else {
      fine.segment(dialPoint(ground, deg, R), dialPoint(ground, deg, R + sideM * 0.01));
    }
  }

  const band = tickBand(ground, R - sideM * 0.004, R + sideM * 0.068);
  const bandMaterial = overlay(visibleMaterial(palette.casing, 0.82));
  bandMaterial.side = THREE.DoubleSide;
  addTwoPass(root, new THREE.Mesh(band, bandMaterial), OVERLAY_ORDER - 12, false);

  const fineLines = fine.build(overlay(lineMaterial(palette.grey, 0.5)));
  if (fineLines) addTwoPass(root, fineLines, OVERLAY_ORDER - 10, false);
  const mediumLines = medium.build(overlay(lineMaterial(palette.ink, 0.7)));
  if (mediumLines) addTwoPass(root, mediumLines, OVERLAY_ORDER - 9, false);
  const axisLines = axes.build(overlay(dashedLineMaterial(palette.ink, 0.8, sideM * 0.012, sideM * 0.008)));
  if (axisLines) addTwoPass(root, axisLines, OVERLAY_ORDER - 8, false);

  const horizon = polylineTube(dialCircle(ground, R, 1), sideM * 0.0012);
  if (horizon) addTwoPass(root, new THREE.Mesh(horizon, overlay(visibleMaterial(palette.ink))), OVERLAY_ORDER - 6, false);
  const ticks = mergeAndDispose(majorTicks);
  if (ticks) addTwoPass(root, new THREE.Mesh(ticks, overlay(visibleMaterial(palette.ink))), OVERLAY_ORDER - 6, false);

  for (let deg = 10; deg < 360; deg += 10) {
    if (deg % 90 === 0) continue;
    const number = textSprite(`${deg}°`, { ink: palette.grey, halo: palette.halo, heightM: sideM * 0.017 });
    if (!number) continue;
    number.position.copy(dialPoint(ground, deg, R + sideM * 0.05));
    root.userData.degreeLabels.push(number);
    root.add(number);
  }

  for (const [text, deg] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const) {
    const north = text === "N";
    const label = textSprite(text, {
      ink: palette.ink,
      halo: palette.halo,
      heightM: sideM * (north ? 0.062 : 0.045),
      weight: north ? 800 : 650,
    });
    if (!label) continue;
    label.position.copy(dialPoint(ground, deg, R + sideM * 0.088));
    label.position.y += sideM * 0.012;
    label.renderOrder = OVERLAY_ORDER + 50;
    root.userData.cardinals.push(label);
    root.add(label);
  }
}

function buildSunPaths(
  root: HeliodonRoot,
  palette: HeliodonPalette,
  lat: number,
  lon: number,
  year: number,
  sideM: number,
  centre: THREE.Vector3,
) {
  const dome = sideM * HELIODON_DOME_FRACTION;
  const dots = hourDotMaterial(palette.ink, palette.casing);
  const casing = visibleMaterial(palette.casing);
  const onDome = (direction: Vec3) => sampleToPoint(direction, dome, centre.y);
  const outward = (point: THREE.Vector3, by: number) => point.clone().sub(centre).normalize().multiplyScalar(by).add(point);
  const hourPoints = new Map<number, THREE.Vector3[]>();

  for (const style of SUN_PATH_STYLES) {
    const { month, day } = style.date;
    const samples = daylightArcSamples(lat, lon, year, month, day, 5).filter((sample) => sample.aboveHorizon);
    const points = samples.map((sample) => onDome(sample.direction));
    const pattern = style.pattern?.map((fraction) => fraction * sideM) ?? null;
    const stroke = strokeGeometry(points, sideM * 0.0013, pattern);
    const outline = strokeGeometry(points, sideM * 0.0028, pattern);
    if (outline) addTwoPass(root, new THREE.Mesh(outline, casing), OVERLAY_ORDER, false);
    if (stroke) addTwoPass(root, new THREE.Mesh(stroke, visibleMaterial(getColour(style.key))), OVERLAY_ORDER + 1);

    for (const mark of daylightHourMarks(lat, lon, year, month, day)) {
      const at = onDome(mark.sample.direction);
      const list = hourPoints.get(mark.hour) ?? [];
      list.push(at);
      hourPoints.set(mark.hour, list);
      if (dots) {
        const dot = new THREE.Sprite(dots);
        dot.renderOrder = OVERLAY_ORDER + 30;
        dot.frustumCulled = false;
        dot.position.copy(at);
        dot.scale.setScalar(sideM * 0.011);
        root.add(dot);
      }
      if (!LABELLED_HOURS.has(mark.hour)) continue;
      const label = textSprite(`${mark.hour}h`, { ink: palette.ink, halo: palette.halo, heightM: sideM * 0.022 });
      if (!label) continue;
      const near = outward(at, style.labelSide * sideM * 0.024);
      const far = outward(at, -style.labelSide * sideM * 0.024);
      label.position.copy(near);
      root.userData.movable.push({ sprite: label, spots: [near, far] });
      root.add(label);
    }

    const sunset = points[points.length - 1];
    const sunrise = points[0];
    const name = textSprite(style.label, { ink: palette.ink, halo: palette.halo, heightM: sideM * 0.026, weight: 650 });
    if (name && sunset && sunrise) {
      const lift = (point: THREE.Vector3) => {
        const spot = outward(point, sideM * 0.035);
        spot.y = centre.y + sideM * 0.04;
        return spot;
      };
      const spots = [lift(sunset), lift(sunrise)];
      name.position.copy(spots[0]);
      root.userData.movable.push({ sprite: name, spots });
      root.add(name);
    }
  }

  const hourLines = new SegmentBatch();
  for (const points of hourPoints.values()) {
    if (points.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const samples = curve.getPoints(points.length * 12).map((point) =>
      point.sub(centre).normalize().multiplyScalar(dome).add(centre),
    );
    hourLines.polyline(samples);
  }
  const hourMaterial = dashedLineMaterial(palette.grey, 0.8, sideM * 0.004, sideM * 0.004);
  const hourSegments = hourLines.build(hourMaterial);
  if (hourSegments) addTwoPass(root, hourSegments, OVERLAY_ORDER - 5);
}

type ScreenBox = { x: number; y: number; w: number; h: number };

const scratch = {
  centre: new THREE.Vector3(),
  edge: new THREE.Vector3(),
  right: new THREE.Vector3(),
  up: new THREE.Vector3(),
  toCamera: new THREE.Vector3(),
  outward: new THREE.Vector3(),
};

function screenBox(position: THREE.Vector3, scale: THREE.Vector3, camera: THREE.Camera, width: number, height: number): ScreenBox {
  scratch.right.setFromMatrixColumn(camera.matrixWorld, 0);
  scratch.up.setFromMatrixColumn(camera.matrixWorld, 1);
  scratch.centre.copy(position).project(camera);
  const x = ((scratch.centre.x + 1) / 2) * width;
  const y = ((1 - scratch.centre.y) / 2) * height;
  scratch.edge.copy(position).addScaledVector(scratch.right, scale.x / 2).addScaledVector(scratch.up, scale.y / 2).project(camera);
  const ex = ((scratch.edge.x + 1) / 2) * width;
  const ey = ((1 - scratch.edge.y) / 2) * height;
  return { x, y, w: Math.abs(ex - x), h: Math.abs(ey - y) };
}

function overlaps(a: ScreenBox, b: ScreenBox, margin = 6): boolean {
  return Math.abs(a.x - b.x) < a.w + b.w + margin && Math.abs(a.y - b.y) < a.h + b.h + margin;
}

/** Fades far-side degree numbers and moves hour and arc labels off the cardinals and the sun. */
function useHeliodonLabels(root: HeliodonRoot | null, sun: THREE.Object3D | null, centre: THREE.Vector3) {
  useFrame(({ camera, size }) => {
    if (!root) return;
    scratch.toCamera.copy(camera.position).sub(centre);
    const lookingDown = scratch.toCamera.y / Math.max(scratch.toCamera.length(), 1e-6);
    scratch.toCamera.y = 0;
    scratch.toCamera.normalize();
    for (const label of root.userData.degreeLabels) {
      scratch.outward.copy(label.position).sub(centre);
      scratch.outward.y = 0;
      scratch.outward.normalize();
      const facing = scratch.outward.dot(scratch.toCamera);
      const near = THREE.MathUtils.smoothstep(facing, -0.35, 0.25);
      const opacity = lookingDown > 0.92 ? 1 : near;
      (label.material as THREE.SpriteMaterial).opacity = opacity;
      label.visible = opacity > 0.03;
    }

    const blockers = root.userData.cardinals.map((label) => screenBox(label.position, label.scale, camera, size.width, size.height));
    if (sun?.visible) {
      const icon = sun.children[0];
      if (icon) blockers.push(screenBox(sun.position, icon.scale, camera, size.width, size.height));
    }
    for (const label of root.userData.movable) {
      let placed = false;
      for (const spot of label.spots) {
        const box = screenBox(spot, label.sprite.scale, camera, size.width, size.height);
        if (blockers.some((blocker) => overlaps(box, blocker))) continue;
        label.sprite.position.copy(spot);
        placed = true;
        break;
      }
      label.sprite.visible = placed;
    }
  });
}

export function SolarHeliodon({
  lat,
  lon,
  sideM,
  groundY,
  terrain,
  settings,
}: {
  lat: number;
  lon: number;
  sideM: number;
  groundY: number;
  terrain?: TerrainField;
  settings: SolarViewSettings;
}) {
  const sample = useMelbourneSunSample(lat, lon, settings);
  const colourTick = useColourRevision();
  const show = settings.showPath;
  const ground = useMemo<Ground>(
    () => (terrain ? (x, z) => sampleTerrain(terrain, x, -z, sideM) : () => groundY),
    [terrain, sideM, groundY],
  );
  const centre = useMemo(() => new THREE.Vector3(0, ground(0, 0), 0), [ground]);

  const root = useDisposable(() => {
    const group = new THREE.Group() as HeliodonRoot;
    group.name = "Heliodon";
    group.userData = { cardinals: [], degreeLabels: [], movable: [] };
    if (!show) return group;
    const palette = heliodonPalette();
    buildDial(group, palette, sideM, ground);
    buildSunPaths(group, palette, lat, lon, settings.year, sideM, centre);
    markScreenOnly(group);
    return group;
  }, [show, lat, lon, settings.year, sideM, ground, centre, colourTick]);

  const marker = useDisposable(() => {
    const group = new THREE.Group();
    const icon = sunIcon(heliodonPalette().sun, heliodonPalette().casing);
    if (icon) {
      icon.scale.setScalar(sideM * 0.075);
      group.add(icon);
    }
    markScreenOnly(group);
    return group;
  }, [sideM, colourTick]);
  marker.position.copy(sampleToPoint(sample.direction, sideM * HELIODON_DOME_FRACTION, centre.y));
  marker.visible = show && sample.aboveHorizon;

  useHeliodonLabels(show ? root : null, marker, centre);

  if (!show) return null;
  return (
    <>
      <primitive object={root} />
      <primitive object={marker} />
    </>
  );
}

/** Sun-coloured directional light whose orthographic shadow camera is fitted to the site bounds. */
export function SolarLight({
  sample,
  sideM,
  enabled,
  targetY,
  topY,
}: {
  sample: SolarSample;
  sideM: number;
  enabled: boolean;
  targetY: number;
  /** Highest point in the cut (tallest roof or terrain peak), world Y. */
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
        intensity={on ? 2.6 : 0}
        castShadow={on}
        shadow-mapSize={[2048, 2048]}
      />
    </>
  );
}
