import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { markScreenOnly } from "../lib/screenOnly";
import { useColourRevision } from "../lib/useColourRevision";
import {
  SOLAR_EQUINOX,
  SOLAR_SUMMER,
  SOLAR_WINTER,
  daylightArcSamples,
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
/** Ground compass ring radius as a fraction of the cut side. */
export const HELIODON_RING_FRACTION = 0.6;

function overlayMaterial(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false });
}

function overlayMesh(geometry: THREE.BufferGeometry, material: THREE.Material, order = OVERLAY_ORDER): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

function tubeAlong(points: THREE.Vector3[], tubeRadius: number, closed = false): THREE.TubeGeometry | null {
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  return new THREE.TubeGeometry(curve, Math.max(32, points.length * 4), tubeRadius, 6, closed);
}

function labelSprite(text: string, ink: string, halo: string, size: number): THREE.Sprite | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.font = "bold 92px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = 16;
  context.strokeStyle = halo;
  context.strokeText(text, 64, 68);
  context.fillStyle = ink;
  context.fillText(text, 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = OVERLAY_ORDER + 2;
  sprite.frustumCulled = false;
  return sprite;
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
    const dome = sideM * HELIODON_DOME_FRACTION;
    const ring = sideM * HELIODON_RING_FRACTION;
    const arcs = [
      { date: SOLAR_SUMMER, key: "--sun-arc-summer" },
      { date: SOLAR_EQUINOX, key: "--sun-arc-equinox" },
      { date: SOLAR_WINTER, key: "--sun-arc-winter" },
    ] as const;
    for (const arc of arcs) {
      const points = daylightArcSamples(lat, lon, year, arc.date.month, arc.date.day, 20)
        .filter((sample) => sample.aboveHorizon)
        .map((sample) => sampleToPoint(sample.direction, dome, groundY));
      const geometry = tubeAlong(points, sideM * 0.0035);
      if (geometry) group.add(overlayMesh(geometry, overlayMaterial(getColour(arc.key))));
    }

    const compass = getColour("--sun-compass");
    const ringPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.sin(t) * ring, groundY + 0.5, -Math.cos(t) * ring));
    }
    const ringGeometry = tubeAlong(ringPoints, sideM * 0.0025, true);
    if (ringGeometry) group.add(overlayMesh(ringGeometry, overlayMaterial(compass), OVERLAY_ORDER - 1));

    const tick = sideM * 0.04;
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * Math.PI * 2;
      const inner = new THREE.Vector3(Math.sin(t) * (ring - tick), groundY + 0.5, -Math.cos(t) * (ring - tick));
      const outer = new THREE.Vector3(Math.sin(t) * (ring + tick), groundY + 0.5, -Math.cos(t) * (ring + tick));
      const geometry = tubeAlong([inner, outer], sideM * (i === 0 ? 0.005 : 0.003));
      if (geometry) group.add(overlayMesh(geometry, overlayMaterial(compass), OVERLAY_ORDER - 1));
    }

    const ink = getColour("--sun-compass-label");
    const halo = getColour("--sheet-fill");
    const labelAt = ring + sideM * 0.075;
    const labels: [string, number, number][] = [
      ["N", 0, -1],
      ["E", 1, 0],
      ["S", 0, 1],
      ["W", -1, 0],
    ];
    for (const [text, x, z] of labels) {
      const sprite = labelSprite(text, ink, halo, sideM * 0.075);
      if (!sprite) continue;
      sprite.position.set(x * labelAt, groundY + sideM * 0.03, z * labelAt);
      group.add(sprite);
    }
    markScreenOnly(group);
    return group;
  }, [lat, lon, year, sideM, groundY, colourTick]);
  return <primitive object={root} />;
}

function SunMarker({ sample, sideM, groundY }: { sample: SolarSample; sideM: number; groundY: number }) {
  const colourTick = useColourRevision();
  const marker = useDisposable(() => {
    const group = new THREE.Group();
    const size = sideM * 0.022;
    const outline = overlayMesh(
      new THREE.SphereGeometry(size * 1.3, 20, 14),
      new THREE.MeshBasicMaterial({
        color: getColour("--sun-compass"),
        side: THREE.BackSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
      OVERLAY_ORDER + 3,
    );
    const core = overlayMesh(
      new THREE.SphereGeometry(size, 20, 14),
      overlayMaterial(getColour("--sun-marker")),
      OVERLAY_ORDER + 4,
    );
    group.add(outline, core);
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
        intensity={on ? 1.6 : 0}
        castShadow={on}
        shadow-mapSize={[2048, 2048]}
      />
    </>
  );
}
