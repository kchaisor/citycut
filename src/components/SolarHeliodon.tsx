import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { getColour } from "../lib/colours";
import { markScreenOnly } from "../lib/screenOnly";
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

function decimate(samples: SolarSample[], every: number): SolarSample[] {
  return samples.filter((_, index) => index % every === 0 || index === samples.length - 1);
}

function HeliodonPolyline({
  points,
  color,
}: {
  points: THREE.Vector3[] | null;
  color: string;
  lineWidth?: number;
}) {
  const line = useMemo(() => {
    if (!points || points.length < 2) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 1000;
    return line;
  }, [points, color]);
  useEffect(() => {
    return () => {
      if (!line) return;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    };
  }, [line]);
  if (!line) return null;
  return <primitive object={line} />;
}

function ArcLine({
  samples,
  color,
  radius,
  groundY,
}: {
  samples: SolarSample[];
  color: string;
  radius: number;
  groundY: number;
}) {
  const points = useMemo(() => {
    const visible = decimate(
      samples.filter((sample) => sample.aboveHorizon),
      2,
    );
    if (visible.length < 2) return null;
    return visible.map((sample) => sampleToPoint(sample.direction, radius, groundY));
  }, [samples, radius, groundY]);
  return <HeliodonPolyline points={points} color={color} />;
}

function CompassRing({ radius, groundY }: { radius: number; groundY: number }) {
  const ringColor = getColour("--sun-compass");
  const { ring, north } = useMemo(() => {
    const ringPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.sin(t) * radius, groundY + 0.05, -Math.cos(t) * radius));
    }
    const northPts = [
      new THREE.Vector3(0, groundY + 0.06, -radius * 1.05),
      new THREE.Vector3(0, groundY + radius * 0.3, -radius * 0.95),
    ];
    return { ring: ringPts, north: northPts };
  }, [radius, groundY]);
  return (
    <group>
      <HeliodonPolyline points={ring} color={ringColor} />
      <HeliodonPolyline points={north} color={ringColor} lineWidth={2} />
    </group>
  );
}

export function useMelbourneSunSample(lat: number, lon: number, settings: SolarViewSettings): SolarSample {
  const { year, month, day, hour, minute } = settings;
  return useMemo(
    () => sunSample(lat, lon, melbourneLocalToUtc(year, month, day, hour, minute)),
    [lat, lon, year, month, day, hour, minute],
  );
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
  const radius = sideM * 1.2;
  const { year } = settings;
  const melbourneActive = useMelbourneSunSample(lat, lon, settings);
  const summer = useMemo(
    () => daylightArcSamples(lat, lon, year, SOLAR_SUMMER.month, SOLAR_SUMMER.day, 30),
    [lat, lon, year],
  );
  const equinox = useMemo(
    () => daylightArcSamples(lat, lon, year, SOLAR_EQUINOX.month, SOLAR_EQUINOX.day, 30),
    [lat, lon, year],
  );
  const winter = useMemo(
    () => daylightArcSamples(lat, lon, year, SOLAR_WINTER.month, SOLAR_WINTER.day, 30),
    [lat, lon, year],
  );

  const rootRef = useRef<THREE.Group>(null);
  useEffect(() => {
    if (rootRef.current) markScreenOnly(rootRef.current);
  }, [settings.showPath]);

  if (!settings.showPath) return null;

  const marker = sampleToPoint(melbourneActive.direction, radius, groundY);
  const markerColor = getColour("--sun-marker");

  return (
    <group ref={rootRef}>
      <ArcLine samples={summer} color={getColour("--sun-arc-summer")} radius={radius} groundY={groundY} />
      <ArcLine samples={equinox} color={getColour("--sun-arc-equinox")} radius={radius} groundY={groundY} />
      <ArcLine samples={winter} color={getColour("--sun-arc-winter")} radius={radius} groundY={groundY} />
      <CompassRing radius={radius} groundY={groundY} />
      {melbourneActive.aboveHorizon && (
        <mesh position={marker}>
          <sphereGeometry args={[sideM * 0.012, 10, 10]} />
          <meshBasicMaterial color={markerColor} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function SolarLight({
  sample,
  sideM,
  enabled,
  targetY,
}: {
  sample: SolarSample;
  sideM: number;
  enabled: boolean;
  targetY: number;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (lightRef.current) markScreenOnly(lightRef.current);
  }, []);
  useEffect(() => {
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;
    light.target = target;
    target.position.set(0, targetY, 0);
    light.target.updateMatrixWorld();
  }, [targetY]);
  const on = enabled && sample.aboveHorizon;
  const distance = sideM * 2.4;
  const [dx, dy, dz] = sample.direction;
  useFrame(() => {
    const light = lightRef.current;
    if (!light?.castShadow) return;
    light.shadow.updateMatrices(light);
  });
  return (
    <>
      <object3D ref={targetRef} />
      <directionalLight
        ref={lightRef}
        position={[dx * distance, dy * distance + targetY, dz * distance]}
        intensity={on ? 1.85 : 0}
        castShadow={on}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.015}
        shadow-camera-near={sideM * 0.05}
        shadow-camera-far={sideM * 5}
        shadow-camera-left={-sideM * 0.75}
        shadow-camera-right={sideM * 0.75}
        shadow-camera-top={sideM * 0.75}
        shadow-camera-bottom={-sideM * 0.75}
      />
    </>
  );
}
