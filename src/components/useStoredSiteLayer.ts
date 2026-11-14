import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { disposeObject } from "../lib/buildCity";
import { buildStoredSiteLayerGroup } from "../lib/storedSiteLayers/scene";
import { waterCutContextFromModel } from "../lib/waterSurfaceCut";
import type { BuildingColourMode } from "../lib/buildingViewportColor";
import type { CityModel } from "../types";

export function useStoredSiteLayer(
  model: CityModel,
  colourMode: BuildingColourMode,
): { group: THREE.Group | null; loading: boolean; error: string | null } {
  const layer = model.storedSiteLayer ?? null;
  const [group, setGroup] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colourKey = useMemo(
    () =>
      `${colourMode.colourByUse}:${colourMode.uniformBuildings}:${colourMode.colourBySource}`,
    [colourMode.colourBySource, colourMode.colourByUse, colourMode.uniformBuildings],
  );
  const waterAreaKey = useMemo(
    () =>
      model.areas
        .filter((area) => area.kind === "water")
        .map((area) => `${area.id}:${area.ring.length}`)
        .join("|"),
    [model.areas],
  );
  useEffect(() => {
    if (!layer) {
      setGroup(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void buildStoredSiteLayerGroup(
      layer,
      layer.manifest,
      model.center,
      layer.zone,
      colourMode,
      model.sideM,
      model.frameShape,
      waterCutContextFromModel(model),
    )
      .then((built) => {
        if (cancelled) {
          built?.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
          });
          return;
        }
        setGroup((prev) => {
          if (prev) disposeObject(prev);
          return built;
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setGroup((prev) => {
          if (prev) disposeObject(prev);
          return null;
        });
        setLoading(false);
        setError(err instanceof Error ? err.message : "Stored site meshes could not load.");
      });
    return () => {
      cancelled = true;
    };
  }, [layer, model, model.center.lat, model.center.lon, model.sideM, model.frameShape, waterAreaKey, colourKey]);
  useEffect(
    () => () => {
      setGroup((prev) => {
        if (prev) disposeObject(prev);
        return null;
      });
    },
    [],
  );
  return { group, loading, error };
}
