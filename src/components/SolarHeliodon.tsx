import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getColour } from "../lib/colours";
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

/** Paint after the city and ignore depth so the heliodon reads over the towers. */
const OVERLAY_ORDER = 1000;

/** Dome radius as a fraction of the cut side. Sized so the summer arc stays in the default 3D frame. */
export const HELIODON_DOME_FRACTION = 0.36;
/** Ground compass ring radius as a fraction of the cut side. Labels sit just inside it so all four stay in the default frame. */
export const HELIODON_RING_FRACTION = 0.55;

/** Dash patterns as fractions of the cut side: on, off, on, off… `null` is a solid line. */
export const SUN_PATH_STYLES = [
  { date: SOLAR_SUMMER, label: "Dec 21", key: "--sun-arc-summer", pattern: null },
  { date: SOLAR_EQUINOX, label: "Sep/Mar", key: "--sun-arc-equinox", pattern: [0.018, 0.011] },
  { date: SOLAR_WINTER, label: "Jun 21", key: "--sun-arc-winter", pattern: [0.024, 0.009, 0.004, 0.009] },
] as const;

const LABELLED_HOURS = new Set([6, 9, 12, 15, 18]);

function overlayMaterial(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false });
}

function overlayMesh(geometry: THREE.BufferGeometry, material: THREE.Material, order = OVERLAY_ORDER): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
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
  const sprite = canvasSprite(canvas, OVERLAY_ORDER + 2);
  sprite.scale.set((options.heightM * canvas.width) / canvas.height, options.heightM, 1);
  return sprite;
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

function sunIcon(core: string, ink: string): THREE.Sprite | null {
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
    context.lineWidth = 22;
    context.strokeStyle = ink;
    context.stroke();
    context.lineWidth = 12;
    context.strokeStyle = core;
    context.stroke();
  }
  context.beginPath();
  context.arc(0, 0, 50, 0, Math.PI * 2);
  context.fillStyle = core;
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = ink;
  context.stroke();
  return canvasSprite(canvas, OVERLAY_ORDER + 5);
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
function useDisposable(build: () => THREE.Object3D, deps: readonly unknown[]): THREE.Object3D {
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

function buildSunPaths(group: THREE.Group, lat: number, lon: number, year: number, sideM: number, groundY: number) {
  const dome = sideM * HELIODON_DOME_FRACTION;
  const ink = getColour("--sun-compass-label");
  const halo = getColour("--sheet-fill");
  const dots = hourDotMaterial(ink, halo);
  const outward = (point: THREE.Vector3, by: number) => {
    const centre = new THREE.Vector3(0, groundY, 0);
    return point.clone().sub(centre).normalize().multiplyScalar(by).add(point);
  };
  for (const style of SUN_PATH_STYLES) {
    const { month, day } = style.date;
    const samples = daylightArcSamples(lat, lon, year, month, day, 5).filter((sample) => sample.aboveHorizon);
    const points = samples.map((sample) => sampleToPoint(sample.direction, dome, groundY));
    const pattern = style.pattern?.map((fraction) => fraction * sideM) ?? null;
    const stroke = strokeGeometry(points, sideM * 0.0013, pattern);
    if (stroke) group.add(overlayMesh(stroke, overlayMaterial(getColour(style.key))));

    for (const mark of daylightHourMarks(lat, lon, year, month, day)) {
      const at = sampleToPoint(mark.sample.direction, dome, groundY);
      if (dots) {
        const dot = new THREE.Sprite(dots);
        dot.renderOrder = OVERLAY_ORDER + 1;
        dot.frustumCulled = false;
        dot.position.copy(at);
        dot.scale.setScalar(sideM * 0.011);
        group.add(dot);
      }
      if (!LABELLED_HOURS.has(mark.hour)) continue;
      const label = textSprite(`${mark.hour}h`, { ink, halo, heightM: sideM * 0.024 });
      if (!label) continue;
      label.position.copy(outward(at, sideM * 0.022));
      group.add(label);
    }

    const end = points[points.length - 1];
    if (end) {
      const name = textSprite(style.label, { ink, halo, heightM: sideM * 0.028, weight: 650 });
      if (name) {
        name.position.copy(outward(end, sideM * 0.04));
        name.position.y = groundY + sideM * 0.035;
        group.add(name);
      }
    }
  }
}

function buildCompass(group: THREE.Group, sideM: number, groundY: number) {
  const ring = sideM * HELIODON_RING_FRACTION;
  const y = groundY + 0.5;
  const grey = overlayMaterial(getColour("--sun-compass"));
  const ink = getColour("--sun-compass-label");
  const halo = getColour("--sheet-fill");
  const at = (deg: number, radius: number) => {
    const t = (deg * Math.PI) / 180;
    return new THREE.Vector3(Math.sin(t) * radius, y, -Math.cos(t) * radius);
  };

  const ringPoints: THREE.Vector3[] = [];
  for (let deg = 0; deg <= 360; deg += 2) ringPoints.push(at(deg, ring));
  const ringGeometry = polylineTube(ringPoints, sideM * 0.0011);
  if (ringGeometry) group.add(overlayMesh(ringGeometry, grey, OVERLAY_ORDER - 1));

  const ticks: THREE.BufferGeometry[] = [];
  for (let deg = 0; deg < 360; deg += 10) {
    const major = deg % 30 === 0;
    const length = sideM * (major ? 0.03 : 0.014);
    const tick = polylineTube([at(deg, ring), at(deg, ring + length)], sideM * (major ? 0.0014 : 0.0009));
    if (tick) ticks.push(tick);
  }
  const tickGeometry = mergeGeometries(ticks, false);
  for (const tick of ticks) tick.dispose();
  if (tickGeometry) group.add(overlayMesh(tickGeometry, grey, OVERLAY_ORDER - 1));

  const axisPattern = [sideM * 0.016, sideM * 0.012];
  for (const deg of [0, 90]) {
    const axis = strokeGeometry([at(deg + 180, ring), at(deg, ring)], sideM * 0.0008, axisPattern);
    if (axis) group.add(overlayMesh(axis, grey, OVERLAY_ORDER - 2));
  }

  for (let deg = 30; deg < 360; deg += 30) {
    if (deg % 90 === 0) continue;
    const number = textSprite(`${deg}°`, { ink: getColour("--sun-compass"), halo, heightM: sideM * 0.022 });
    if (!number) continue;
    number.position.copy(at(deg, ring + sideM * 0.055));
    group.add(number);
  }

  const labelAt = sideM * 0.5;
  for (const [text, deg] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]] as const) {
    const north = text === "N";
    const label = textSprite(text, {
      ink: north ? ink : getColour("--sun-compass"),
      halo,
      heightM: sideM * (north ? 0.07 : 0.05),
      weight: north ? 800 : 600,
    });
    if (!label) continue;
    label.position.copy(at(deg, labelAt));
    label.position.y = groundY + sideM * 0.03;
    group.add(label);
  }
}

function HeliodonStatic({
  lat,
  lon,
  year,
  sideM,
  groundY,
}: {
  lat: number;
  lon: number;
  year: number;
  sideM: number;
  groundY: number;
}) {
  const colourTick = useColourRevision();
  const root = useDisposable(() => {
    const group = new THREE.Group();
    group.name = "Heliodon";
    buildCompass(group, sideM, groundY);
    buildSunPaths(group, lat, lon, year, sideM, groundY);
    markScreenOnly(group);
    return group;
  }, [lat, lon, year, sideM, groundY, colourTick]);
  return <primitive object={root} />;
}

function SunMarker({ sample, sideM, groundY }: { sample: SolarSample; sideM: number; groundY: number }) {
  const colourTick = useColourRevision();
  const marker = useDisposable(() => {
    const group = new THREE.Group();
    const icon = sunIcon(getColour("--sun-marker"), getColour("--sun-compass-label"));
    if (icon) {
      icon.scale.setScalar(sideM * 0.075);
      group.add(icon);
    }
    markScreenOnly(group);
    return group;
  }, [sideM, colourTick]);
  const dome = sideM * HELIODON_DOME_FRACTION;
  marker.position.copy(sampleToPoint(sample.direction, dome, groundY));
  marker.visible = sample.aboveHorizon;
  return <primitive object={marker} />;
}

export function SolarHeliodon({
  lat,
  lon,
  sideM,
  groundY,
  settings,
}: {
  lat: number;
  lon: number;
  sideM: number;
  groundY: number;
  settings: SolarViewSettings;
}) {
  const sample = useMelbourneSunSample(lat, lon, settings);
  if (!settings.showPath) return null;
  return (
    <>
      <HeliodonStatic lat={lat} lon={lon} year={settings.year} sideM={sideM} groundY={groundY} />
      <SunMarker sample={sample} sideM={sideM} groundY={groundY} />
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
