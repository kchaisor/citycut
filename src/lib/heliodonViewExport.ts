import { getColour } from "./colours";
import type { PdfChunk, PdfEllipse, PdfPath, PdfText } from "./aiDocument";
import type { CameraShot } from "./cameraShot";
import type { HeliodonGroundExportOptions } from "./heliodonDiagram";
import { heliodonRadiusM } from "./heliodonRadius";
import { HELIODON_LABELLED_HOURS, SUN_PATH_STYLES } from "./heliodonSunPaths";
import {
  altitudeRingRadius,
  DIAL_PLANE_EPSILON_M,
  dialPoint,
  flatDialGround,
  heliodonPoint,
  horizonArcDirections,
  type GroundHeight,
} from "./heliodonGeometry";
import { meanTerrainElevation } from "./terrain";
import { hexRgb } from "./lineweights";
import {
  daylightHourMarks,
  sunAtMelbourneLocal,
  type Vec3,
} from "./solar";
import type { TerrainField } from "../types";

export type ProjectShot = (
  shot: CameraShot,
  world: [number, number, number],
  pageW: number,
  pageH: number,
) => { x: number; y: number; z: number } | null;

function dashMm(pattern: readonly number[] | null, sideM: number, scaleToMm: number): number[] | undefined {
  if (!pattern) return undefined;
  return pattern.map((fraction) => (fraction * sideM * scaleToMm) / 1000);
}

function projectLine(
  projectPoint: ProjectShot,
  shot: CameraShot,
  pageW: number,
  pageH: number,
  points: Vec3[],
): number[][] | null {
  const ring: number[][] = [];
  for (const point of points) {
    const at = projectPoint(shot, point, pageW, pageH);
    if (!at) return null;
    ring.push([at.x, at.y]);
  }
  return ring.length >= 2 ? ring : null;
}

function circleWorld(radius: number, ground: GroundHeight, stepDeg = 2): Vec3[] {
  const points: Vec3[] = [];
  for (let deg = 0; deg <= 360; deg += stepDeg) points.push(dialPoint(deg, radius, ground));
  return points;
}

export function heliodonViewChunks(
  projectPoint: ProjectShot,
  shot: CameraShot,
  pageW: number,
  pageH: number,
  options: HeliodonGroundExportOptions,
  terrain: TerrainField | null | undefined,
  groundY: number,
): PdfChunk[] {
  const ringRadius = heliodonRadiusM(options.sideM, options.radiusFactor);
  const dialPlaneY = (terrain ? meanTerrainElevation(terrain) : groundY) + DIAL_PLANE_EPSILON_M;
  const ground = flatDialGround(dialPlaneY);
  const sideM = options.sideM;
  const ink = hexRgb(getColour("--sun-compass-label"));
  const grey = hexRgb(getColour("--sun-compass"));
  const paths: PdfPath[] = [];
  const ellipses: PdfEllipse[] = [];
  const texts: PdfText[] = [];
  const strokeScale = pageW / Math.max(shot.width, 1);

  const pushStroke = (points: Vec3[], stroke: typeof ink, mm: number, dash?: number[]) => {
    const ring = projectLine(projectPoint, shot, pageW, pageH, points);
    if (!ring) return;
    paths.push({
      rings: [ring],
      close: false,
      stroke,
      strokeMm: mm * strokeScale * 0.35,
      ...(dash && dash.length >= 2 ? { dashMm: dash } : {}),
    });
  };

  pushStroke(circleWorld(ringRadius, ground, 1.5), ink, 0.35);
  for (const alt of [30, 60]) pushStroke(circleWorld(altitudeRingRadius(alt, ringRadius), ground, 2), grey, 0.2);

  for (let deg = 0; deg < 360; deg += 1) {
    const onRing = dialPoint(deg, ringRadius, ground);
    let length = sideM * 0.028;
    let color = grey;
    let mm = 0.14;
    if (deg % 90 === 0) {
      length = sideM * 0.11;
      color = ink;
      mm = 0.22;
    } else if (deg % 10 === 0) {
      length = sideM * 0.075;
      color = ink;
      mm = 0.18;
    } else if (deg % 5 === 0) {
      length = sideM * 0.048;
      color = ink;
      mm = 0.16;
    }
    const dir = Math.hypot(onRing[0], onRing[2]) || 1;
    const off: Vec3 = [onRing[0] + (onRing[0] / dir) * length, onRing[1], onRing[2] + (onRing[2] / dir) * length];
    pushStroke([onRing, off], color, mm);
  }

  const { lat, lon, year } = options;
  const hourDirections = new Map<number, Vec3[]>();
  for (const style of SUN_PATH_STYLES) {
    const { month, day } = style.date;
    const arc = horizonArcDirections(lat, lon, year, month, day, 5).map((direction) =>
      heliodonPoint(direction, ringRadius, ground),
    );
    if (arc.length >= 2) {
      const dash = dashMm(style.pattern, sideM, strokeScale);
      pushStroke(arc, hexRgb(getColour(style.key)), 0.22, dash);
    }
    for (const mark of daylightHourMarks(lat, lon, year, month, day)) {
      const at = heliodonPoint(mark.sample.direction, ringRadius, ground);
      const list = hourDirections.get(mark.hour) ?? [];
      list.push(mark.sample.direction);
      hourDirections.set(mark.hour, list);
      const projected = projectPoint(shot, at, pageW, pageH);
      if (projected) {
        ellipses.push({
          kind: "ellipse",
          cx: projected.x,
          cy: projected.y,
          rx: strokeScale * 0.9,
          ry: strokeScale * 0.9,
          fill: ink,
        });
      }
      if (!HELIODON_LABELLED_HOURS.has(mark.hour)) continue;
      const labelAt = projectPoint(shot, at, pageW, pageH);
      if (labelAt) texts.push({ x: labelAt.x, y: labelAt.y, sizeMm: strokeScale * 2, text: `${mark.hour}h`, color: ink });
    }
    const labelPoint = arc[Math.floor(arc.length / 2)];
    if (labelPoint) {
      const labelAt = projectPoint(shot, labelPoint, pageW, pageH);
      if (labelAt) texts.push({ x: labelAt.x, y: labelAt.y, sizeMm: strokeScale * 2.2, text: style.label, color: ink });
    }
  }

  for (const directions of hourDirections.values()) {
    if (directions.length < 2) continue;
    const samples: Vec3[] = [];
    for (let i = 0; i < directions.length; i++) {
      const t = i / Math.max(1, directions.length - 1);
      const a = directions[Math.floor(t * (directions.length - 1))]!;
      samples.push(heliodonPoint(a, ringRadius, ground));
    }
    pushStroke(samples, grey, 0.14, [strokeScale * 1.2, strokeScale * 1.2]);
  }

  const sample = sunAtMelbourneLocal(
    options.lat,
    options.lon,
    options.year,
    options.month,
    options.day,
    options.hour,
    options.minute,
  );
  if (sample.aboveHorizon) {
    const sun = heliodonPoint(sample.direction, ringRadius, ground);
    const at = projectPoint(shot, sun, pageW, pageH);
    if (at) {
      const r = strokeScale * 2.4;
      ellipses.push({ kind: "ellipse", cx: at.x, cy: at.y, rx: r, ry: r, fill: hexRgb(getColour("--sun-marker")) });
    }
  }

  for (const [text, deg] of [
    ["N", 0],
    ["E", 90],
    ["S", 180],
    ["W", 270],
  ] as const) {
    const at = dialPoint(deg, ringRadius + sideM * 0.088, ground);
    const projected = projectPoint(shot, at, pageW, pageH);
    if (projected) texts.push({ x: projected.x, y: projected.y, sizeMm: strokeScale * (text === "N" ? 4 : 3.2), text, color: ink });
  }

  if (paths.length === 0 && ellipses.length === 0 && texts.length === 0) return [];
  return [{ name: "Sun path", paths, ellipses, texts }];
}
