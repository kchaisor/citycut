import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import { getColour } from "../lib/colours";
import {
  DIAL_PLANE_EPSILON_M,
  HELIODON_LIFT_M,
  altitudeRingRadius,
  dialPoint,
  flatDialGround,
  heliodonPoint,
  horizonArcDirections,
  type GroundHeight,
} from "../lib/heliodonGeometry";
import { heliodonRadiusM } from "../lib/heliodonRadius";
import { HELIODON_LABELLED_HOURS, SUN_PATH_STYLES } from "../lib/heliodonSunPaths";
import { dialPixelsPerDegree, dialTickLodOpacity } from "../lib/dialLod";
import { heliodonPalette, type HeliodonPalette } from "../lib/heliodonPalette";
import { meanTerrainElevation } from "../lib/terrain";
import type { TerrainField } from "../types";
import { markScreenOnly } from "../lib/screenOnly";
import { useColourRevision } from "../lib/useColourRevision";
import {
  daylightHourMarks,
  melbourneLocalToUtc,
  sunSample,
  type SolarSample,
  type Vec3,
} from "../lib/solar";

export type SolarViewSettings = {
  showPath: boolean;
  castShadows: boolean;
  /** Horizon-ring radius as a multiple of the site half-width. */
  radiusFactor: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** Paint after the city so the heliodon sits over it. */
const OVERLAY_ORDER = 1000;

export { SUN_PATH_STYLES } from "../lib/heliodonSunPaths";
/** Opacity of the second pass that draws heliodon lines where buildings hide them. */
const GHOST_OPACITY = 0.38;
/** Labels on the ground keep more of their ink when hidden, so they stay legible. */
const LABEL_GHOST_OPACITY = 0.35;
/** Extra screen pixels of background-coloured casing around each dial hairline. */
const CASING_PX = 1.5;

const vec = (point: Vec3) => new THREE.Vector3(point[0], point[1], point[2]);

function visibleMaterial(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, depthWrite: false, toneMapped: false });
}

function ghostMaterial<T extends THREE.Material>(material: T, opacity = GHOST_OPACITY): T {
  const ghost = material.clone();
  ghost.depthFunc = THREE.GreaterDepth;
  ghost.depthWrite = false;
  ghost.transparent = true;
  ghost.opacity = material.opacity * opacity;
  return ghost;
}

type DialLodTier = "minor" | "medium" | "inner";

function registerDialLod(root: HeliodonRoot, material: LineMaterial, tier: DialLodTier, baseOpacity: number) {
  root.userData.lodMaterials.push({ tier, material, baseOpacity });
}

/** Adds a visible pass and, unless it is a casing, a ghosted pass that only paints where something is in front. */
function addTwoPass(
  root: HeliodonRoot,
  object: THREE.Mesh | LineSegments2,
  order: number,
  ghost = true,
  lod?: { tier: DialLodTier; baseOpacity: number },
) {
  object.renderOrder = order;
  object.frustumCulled = false;
  root.add(object);
  const visible = object.material as LineMaterial;
  if (lod && visible.isLineMaterial) registerDialLod(root, visible, lod.tier, lod.baseOpacity);
  if (!ghost) return;
  const hidden = object.clone();
  const material = ghostMaterial(object.material as THREE.Material);
  hidden.material = material;
  if ((material as LineMaterial).isLineMaterial) {
    // Overlapping segment caps would blend twice and read as beads along the line.
    material.depthWrite = true;
    root.userData.lineMaterials.push(material as LineMaterial);
    if (lod) registerDialLod(root, material as LineMaterial, lod.tier, lod.baseOpacity * GHOST_OPACITY);
  }
  hidden.renderOrder = order + 20;
  root.add(hidden);
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
  if (pieces.length === 0) return null;
  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  return merged;
}

type LineWeight = { color: string; widthPx: number; opacity?: number; dash?: [number, number]; cased?: boolean };

/** One merged screen-space-width line batch per weight, with an optional casing in the background colour. */
class LineBatch {
  readonly positions: number[] = [];
  segment(a: Vec3, b: Vec3) {
    this.positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  polyline(points: Vec3[]) {
    for (let i = 1; i < points.length; i++) this.segment(points[i - 1], points[i]);
  }
  addTo(root: HeliodonRoot, weight: LineWeight, casing: string, order: number, lodTier?: DialLodTier) {
    if (this.positions.length === 0) return;
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(this.positions);
    const lod = lodTier ? { tier: lodTier, baseOpacity: weight.opacity ?? 1 } : undefined;
    const make = (color: string, widthPx: number, opacity: number, dash?: [number, number]) => {
      const material = new LineMaterial({
        color,
        linewidth: widthPx,
        transparent: opacity < 1,
        opacity,
        depthWrite: false,
        dashed: Boolean(dash),
        dashSize: dash?.[0] ?? 1,
        gapSize: dash?.[1] ?? 0,
      });
      material.toneMapped = false;
      root.userData.lineMaterials.push(material);
      const lines = new LineSegments2(geometry, material);
      if (dash) lines.computeLineDistances();
      return lines;
    };
    if (weight.cased !== false) addTwoPass(root, make(casing, weight.widthPx + CASING_PX, 1), order - 1, false);
    addTwoPass(root, make(weight.color, weight.widthPx, weight.opacity ?? 1, weight.dash), order, true, lod);
  }
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

/** Depth-tests a ground label and adds a faint child copy that shows where buildings hide it. */
function groundLabel(sprite: THREE.Sprite): THREE.Sprite {
  const material = sprite.material as THREE.SpriteMaterial;
  material.depthTest = true;
  const ghost = new THREE.Sprite(ghostMaterial(material, LABEL_GHOST_OPACITY));
  ghost.renderOrder = sprite.renderOrder + 1;
  ghost.frustumCulled = false;
  sprite.add(ghost);
  return sprite;
}

function setLabelOpacity(sprite: THREE.Sprite, opacity: number) {
  (sprite.material as THREE.SpriteMaterial).opacity = opacity;
  const ghost = sprite.children[0] as THREE.Sprite | undefined;
  if (ghost) (ghost.material as THREE.SpriteMaterial).opacity = opacity * LABEL_GHOST_OPACITY;
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
    lineMaterials: LineMaterial[];
    lodMaterials: { tier: DialLodTier; material: LineMaterial; baseOpacity: number }[];
  };
};

/** Faint ring under the horizon ticks only; the site centre stays clear. */
function buildDialAnnulus(root: HeliodonRoot, radius: number, ground: GroundHeight) {
  const geometry = new THREE.RingGeometry(radius * 0.992, radius * 1.008, 96);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: getColour("--heliodon-dial-disc"),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.position.y = ground(0, 0) + 0.05;
  mesh.renderOrder = OVERLAY_ORDER - 45;
  mesh.frustumCulled = false;
  root.add(mesh);
}

function circle(radius: number, ground: GroundHeight, stepDeg = 1): Vec3[] {
  const points: Vec3[] = [];
  for (let deg = 0; deg <= 360; deg += stepDeg) points.push(dialPoint(deg, radius, ground));
  return points;
}

function buildDial(root: HeliodonRoot, palette: HeliodonPalette, ringRadius: number, sideM: number, ground: GroundHeight) {
  const R = ringRadius;
  buildDialAnnulus(root, R, ground);
  const minor = new LineBatch();
  const medium = new LineBatch();
  const major = new LineBatch();
  const strong = new LineBatch();
  const altitude = new LineBatch();

  for (const alt of [30, 60]) altitude.polyline(circle(altitudeRingRadius(alt, R), ground, 2));
  strong.polyline(circle(R, ground));
  for (let deg = 0; deg < 360; deg += 1) {
    if (deg % 90 === 0) strong.segment(dialPoint(deg, R, ground), dialPoint(deg, R + sideM * 0.05, ground));
    else if (deg % 10 === 0) major.segment(dialPoint(deg, R, ground), dialPoint(deg, R + sideM * 0.034, ground));
    else if (deg % 5 === 0) medium.segment(dialPoint(deg, R, ground), dialPoint(deg, R + sideM * 0.022, ground));
    else minor.segment(dialPoint(deg, R, ground), dialPoint(deg, R + sideM * 0.012, ground));
  }

  const { ink, grey, casing } = palette;
  const uncased = { cased: false as const };
  altitude.addTo(root, { color: grey, widthPx: 1.75, ...uncased }, casing, OVERLAY_ORDER - 20, "inner");
  minor.addTo(root, { color: grey, widthPx: 1.5, ...uncased }, casing, OVERLAY_ORDER - 14, "minor");
  medium.addTo(root, { color: ink, widthPx: 2, ...uncased }, casing, OVERLAY_ORDER - 12, "medium");
  major.addTo(root, { color: ink, widthPx: 2.75, ...uncased }, casing, OVERLAY_ORDER - 10);
  strong.addTo(root, { color: ink, widthPx: 3.5, ...uncased }, casing, OVERLAY_ORDER - 8);

  const lift = (sprite: THREE.Sprite, point: Vec3) => sprite.position.set(point[0], point[1] + sprite.scale.y * 0.6, point[2]);
  for (let deg = 10; deg < 360; deg += 10) {
    if (deg % 90 === 0) continue;
    const number = textSprite(`${deg}°`, { ink: grey, halo: palette.halo, heightM: sideM * 0.017, weight: 600 });
    if (!number) continue;
    lift(groundLabel(number), dialPoint(deg, R + sideM * 0.056, ground));
    root.userData.degreeLabels.push(number);
    root.add(number);
  }

  for (const [text, deg] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const) {
    const north = text === "N";
    const label = textSprite(text, {
      ink,
      halo: palette.halo,
      heightM: sideM * (north ? 0.062 : 0.045),
      weight: north ? 800 : 650,
    });
    if (!label) continue;
    label.renderOrder = OVERLAY_ORDER + 50;
    lift(groundLabel(label), dialPoint(deg, R + sideM * 0.088, ground));
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
  ringRadius: number,
  ground: GroundHeight,
  centre: THREE.Vector3,
) {
  const dome = ringRadius;
  const dots = hourDotMaterial(palette.ink, palette.casing);
  const casing = visibleMaterial(palette.casing);
  const onDome = (direction: Vec3) => vec(heliodonPoint(direction, dome, ground));
  const outward = (point: THREE.Vector3, by: number) => point.clone().sub(centre).normalize().multiplyScalar(by).add(point);
  const hourDirections = new Map<number, Vec3[]>();

  for (const style of SUN_PATH_STYLES) {
    const { month, day } = style.date;
    const points = horizonArcDirections(lat, lon, year, month, day, 5).map(onDome);
    if (points.length < 2) continue;
    const pattern = style.pattern?.map((fraction) => fraction * sideM) ?? null;
    const stroke = strokeGeometry(points, sideM * 0.0013, pattern);
    const outline = strokeGeometry(points, sideM * 0.0028, pattern);
    if (outline) addTwoPass(root, new THREE.Mesh(outline, casing), OVERLAY_ORDER, false);
    if (stroke) addTwoPass(root, new THREE.Mesh(stroke, visibleMaterial(getColour(style.key))), OVERLAY_ORDER + 1);

    for (const mark of daylightHourMarks(lat, lon, year, month, day)) {
      const at = onDome(mark.sample.direction);
      const list = hourDirections.get(mark.hour) ?? [];
      list.push(mark.sample.direction);
      hourDirections.set(mark.hour, list);
      if (dots) {
        const dot = new THREE.Sprite(dots);
        dot.renderOrder = OVERLAY_ORDER + 30;
        dot.frustumCulled = false;
        dot.position.copy(at);
        dot.scale.setScalar(sideM * 0.011);
        root.add(dot);
      }
      if (!HELIODON_LABELLED_HOURS.has(mark.hour)) continue;
      const label = textSprite(`${mark.hour}h`, { ink: palette.ink, halo: palette.halo, heightM: sideM * 0.022 });
      if (!label) continue;
      const near = outward(at, style.labelSide * sideM * 0.024);
      const far = outward(at, -style.labelSide * sideM * 0.024);
      label.position.copy(near);
      root.userData.movable.push({ sprite: label, spots: [near, far] });
      root.add(label);
    }

    const name = textSprite(style.label, { ink: palette.ink, halo: palette.halo, heightM: sideM * 0.026, weight: 650 });
    if (name) {
      const spot = (point: THREE.Vector3) => {
        const at = outward(point, sideM * 0.035);
        at.y = point.y + sideM * 0.04;
        return at;
      };
      const spots = [spot(points[points.length - 1]), spot(points[0])];
      name.position.copy(spots[0]);
      root.userData.movable.push({ sprite: name, spots });
      root.add(name);
    }
  }

  const hourLines = new LineBatch();
  for (const directions of hourDirections.values()) {
    if (directions.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(directions.map(vec), false, "centripetal");
    const samples = curve
      .getPoints(directions.length * 12)
      .map((point) => heliodonPoint(point.normalize().toArray() as Vec3, dome, ground));
    hourLines.polyline(samples);
  }
  hourLines.addTo(
    root,
    { color: palette.grey, widthPx: 1.2, dash: [sideM * 0.004, sideM * 0.004], cased: false },
    palette.casing,
    OVERLAY_ORDER - 5,
  );
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

/** Keeps line widths in screen pixels, fades far-side degree numbers, and moves labels off the cardinals and the sun. */
function useHeliodonFrame(
  root: HeliodonRoot | null,
  sun: THREE.Object3D | null,
  centre: THREE.Vector3,
  ringRadius: number,
  ground: GroundHeight,
) {
  useFrame(({ camera, size }) => {
    if (!root) return;
    for (const material of root.userData.lineMaterials) material.resolution.set(size.width, size.height);
    const ringY = ground(0, 0) + HELIODON_LIFT_M;
    const pxPerDegree = dialPixelsPerDegree(
      (x, y, z) => {
        scratch.centre.set(x, y, z).project(camera);
        return scratch.centre;
      },
      size.width,
      size.height,
      ringRadius,
      ringY,
    );
    const lod = dialTickLodOpacity(pxPerDegree);
    for (const entry of root.userData.lodMaterials) {
      const scale =
        entry.tier === "minor" ? lod.minor : entry.tier === "medium" ? lod.medium : lod.inner;
      const opacity = entry.baseOpacity * scale;
      entry.material.opacity = opacity;
      entry.material.transparent = opacity < 0.995;
    }

    scratch.toCamera.copy(camera.position).sub(centre);
    const lookingDown = scratch.toCamera.y / Math.max(scratch.toCamera.length(), 1e-6);
    scratch.toCamera.y = 0;
    scratch.toCamera.normalize();
    for (const label of root.userData.degreeLabels) {
      scratch.outward.copy(label.position).sub(centre);
      scratch.outward.y = 0;
      scratch.outward.normalize();
      const facing = scratch.outward.dot(scratch.toCamera);
      const opacity = lookingDown > 0.92 ? 1 : THREE.MathUtils.smoothstep(facing, -0.35, 0.25);
      setLabelOpacity(label, opacity);
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
  hideDiagram,
}: {
  lat: number;
  lon: number;
  sideM: number;
  groundY: number;
  terrain?: TerrainField;
  settings: SolarViewSettings;
  /** Plan orthographic view shows the 2D overlay instead. */
  hideDiagram?: boolean;
}) {
  const sample = useMelbourneSunSample(lat, lon, settings);
  const colourTick = useColourRevision();
  const ringRadius = heliodonRadiusM(sideM, settings.radiusFactor);
  const show = settings.showPath && !hideDiagram;
  const dialPlaneY = useMemo(
    () => (terrain ? meanTerrainElevation(terrain) : groundY) + DIAL_PLANE_EPSILON_M,
    [terrain, groundY],
  );
  const ground = useMemo<GroundHeight>(() => flatDialGround(dialPlaneY), [dialPlaneY]);
  const centre = useMemo(() => new THREE.Vector3(0, ground(0, 0) + HELIODON_LIFT_M, 0), [ground]);

  const root = useDisposable(() => {
    const group = new THREE.Group() as HeliodonRoot;
    group.name = "Heliodon";
    group.userData = { cardinals: [], degreeLabels: [], movable: [], lineMaterials: [], lodMaterials: [] };
    if (!show) return group;
    const palette = heliodonPalette();
    buildDial(group, palette, ringRadius, sideM, ground);
    buildSunPaths(group, palette, lat, lon, settings.year, sideM, ringRadius, ground, centre);
    markScreenOnly(group);
    return group;
  }, [show, lat, lon, settings.year, sideM, ringRadius, ground, centre, colourTick]);

  const marker = useDisposable(() => {
    const group = new THREE.Group();
    const palette = heliodonPalette();
    const icon = sunIcon(palette.sun, palette.casing);
    if (icon) {
      icon.scale.setScalar(sideM * 0.075);
      group.add(icon);
    }
    markScreenOnly(group);
    return group;
  }, [sideM, colourTick]);
  marker.position.copy(vec(heliodonPoint(sample.direction, ringRadius, ground)));
  marker.visible = show && sample.aboveHorizon;

  useHeliodonFrame(show ? root : null, marker, centre, ringRadius, ground);

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
  intensity = 2.35,
  targetY,
  topY,
}: {
  sample: SolarSample;
  sideM: number;
  enabled: boolean;
  intensity?: number;
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
        intensity={on ? intensity : 0}
        castShadow={on}
        shadow-mapSize={[2048, 2048]}
      />
    </>
  );
}
