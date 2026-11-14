import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sampleTerrain } from "../terrain";
import type { CityModel } from "../../types";
import {
  buildStoredSiteBridgeCableObject,
  STORED_SITE_CABLE_MIN_ZOOM,
} from "./storedSiteBridgeCables";

export function StoredSiteBridgeCables({
  model,
  projection,
}: {
  model: CityModel;
  projection: "iso" | "plan" | "perspective";
}) {
  const plan = model.storedSiteLayer?.bridgePlan ?? model.storedSiteBridgePlan ?? null;
  const sample = useMemo(() => {
    if (!model.terrain) return (_e: number, _n: number) => 0;
    const field = model.terrain;
    const sideM = model.sideM;
    return (east: number, north: number) => sampleTerrain(field, east, north, sideM);
  }, [model.terrain, model.sideM]);
  const object = useMemo(() => {
    if (!plan) return null;
    return buildStoredSiteBridgeCableObject(plan, sample);
  }, [plan, sample]);
  const camera = useThree((state) => state.camera);
  const visibleRef = useRef(true);
  useFrame(() => {
    if (!object) return;
    if (projection === "perspective") {
      object.visible = true;
      return;
    }
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const next = camera.zoom >= STORED_SITE_CABLE_MIN_ZOOM;
    if (next !== visibleRef.current) {
      visibleRef.current = next;
      object.visible = next;
    }
  });
  useEffect(() => {
    if (!object) return;
    object.visible = projection !== "iso" && projection !== "plan" ? true : visibleRef.current;
    return () => {
      object.geometry.dispose();
      const mat = object.material;
      if (mat instanceof THREE.Material) mat.dispose();
    };
  }, [object, projection]);
  if (!object) return null;
  return <primitive object={object} />;
}