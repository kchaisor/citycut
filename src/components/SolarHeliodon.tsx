import { Line } from "@react-three/drei";
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
  if (!points) return null;
  return <Line points={points} color={color} lineWidth={1} transparent opacity={0.85} />;
}

function CompassRing({ radius, groundY }: { radius: number; groundY: number }) {
  const ringColor = getColour("--sun-compass");
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(t) * radius, groundY + 0.05, -Math.cos(t) * radius));
    }
    return pts;
  }, [radius, groundY]);
  const north = useMemo(
    () => [new THREE.Vector3(0, groundY + 0.06, -radius * 1.05), new THREE.Vector3(0, groundY + radius * 0.3, -radius * 0.95)],
    [radius, groundY],
  );
  return (
    <group>
      <Line points={points} color={ringColor} lineWidth={1} />
      <Line points={north} color={ringColor} lineWidth={2} />
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
          <meshBasicMaterial color={markerColor} />
        </mesh>
      )}
    </group>
  );
}

export function SolarLight({
  sample,
  sideM,
  enabled,
}: {
  sample: SolarSample;
  sideM: number;
  enabled: boolean;
}) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    if (lightRef.current) markScreenOnly(lightRef.current);
  }, []);
  const on = enabled && sample.aboveHorizon;
  const distance = sideM * 2.4;
  const [dx, dy, dz] = sample.direction;
  return (
    <directionalLight
      ref={lightRef}
      position={[dx * distance, dy * distance, dz * distance]}
      intensity={on ? 1.05 : 0}
      castShadow={on}
      shadow-mapSize={[1024, 1024]}
      shadow-bias={-0.0005}
      shadow-normalBias={0.02}
      shadow-camera-near={sideM * 0.05}
      shadow-camera-far={sideM * 4}
      shadow-camera-left={-sideM * 0.65}
      shadow-camera-right={sideM * 0.65}
      shadow-camera-top={sideM * 0.65}
      shadow-camera-bottom={-sideM * 0.65}
    />
  );
}
