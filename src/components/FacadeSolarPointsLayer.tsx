import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { facadeBayUnitsForModel, podiumReceptorUnitsForModel } from "../lib/facadeSolarSample";
import { facadeHoursFill } from "../lib/facadeSolarAssess";
import { getColour } from "../lib/colours";
import type { FacadeAssessBundle } from "../lib/facadeSolarTypes";
import type { CityModel } from "../types";

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function FacadeSolarPointsLayer({
  model,
  bundle,
}: {
  model: CityModel;
  bundle: FacadeAssessBundle;
}) {
  const { points, threshold } = useMemo(() => {
    const samples = [...facadeBayUnitsForModel(model), ...podiumReceptorUnitsForModel(model)];
    const summary = bundle.facade;
    const thresholdHours = summary?.thresholdHours ?? 3;
    const byId = new Map((summary?.units ?? []).map((unit) => [unit.id, unit]));
    const positions: number[] = [];
    const colors: number[] = [];
    for (const sample of samples) {
      const unit = byId.get(sample.id);
      const fill = getColour(facadeHoursFill(unit?.hoursDirect ?? 0, thresholdHours));
      const [r, g, b] = hexToRgb(fill);
      positions.push(sample.east, sample.yM, -sample.north);
      colors.push(r / 255, g / 255, b / 255);
    }
  const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return { points: geometry, threshold: thresholdHours };
  }, [model, bundle]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.facadeSolarAssessMs = String(Math.round(bundle.assessMs));
    }
    return () => {
      points.dispose();
    };
  }, [bundle.assessMs, points]);

  if (points.attributes.position.count === 0) return null;

  void threshold;
  return (
    <group data-facade-solar-overlay>
      <points geometry={points} renderOrder={1200}>
        <pointsMaterial
          size={5.5}
          sizeAttenuation
          vertexColors
          depthTest
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  );
}
