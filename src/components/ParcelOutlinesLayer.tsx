import { useEffect, useMemo, useState } from "react";
import { useThree } from "@react-three/fiber";
import type { CityModel } from "../types";
import { getColour } from "../lib/colours";
import { squareBBox } from "../lib/geo";
import {
  buildParcelOutlineIndex,
  buildParcelOutlineLines,
  fetchParcelOutlines,
  searchParcelOutlines,
  type ParcelOutline,
} from "../lib/parcelOutlines";
import { disposeObject } from "../lib/buildCity";

declare global {
  interface Window {
    __citycutQaParcels?: { count: number; segments: number; status: "loading" | "ready" | "error" };
  }
}

/**
 * Cadastral parcel outlines on the ground while Massing mode is on. Geometry lives in the
 * scene's local frame (same as buildings), so it orbits/pans/zooms with the model and never
 * touches the camera. Loads once per cut.
 */
export function ParcelOutlinesLayer({ model }: { model: CityModel }) {
  const invalidate = useThree((s) => s.invalidate);
  const [parcels, setParcels] = useState<ParcelOutline[] | null>(null);
  const cutKey = `${model.center.lat},${model.center.lon},${model.sideM}`;

  useEffect(() => {
    const controller = new AbortController();
    const bounds = squareBBox(model.center, model.sideM);
    window.__citycutQaParcels = { count: 0, segments: 0, status: "loading" };
    setParcels(null);
    fetchParcelOutlines(bounds, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        const index = buildParcelOutlineIndex(loaded);
        setParcels(searchParcelOutlines(index, bounds));
      })
      .catch(() => {
        if (!controller.signal.aborted) window.__citycutQaParcels = { count: 0, segments: 0, status: "error" };
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutKey]);

  const lines = useMemo(
    () => (parcels ? buildParcelOutlineLines(model, parcels, getColour("--parcel-outline")) : null),
    [model, parcels],
  );

  useEffect(() => {
    if (parcels) {
      const segments = lines ? lines.geometry.getAttribute("position").count / 2 : 0;
      window.__citycutQaParcels = { count: parcels.length, segments, status: "ready" };
    }
    invalidate();
    return () => {
      if (lines) disposeObject(lines);
    };
  }, [invalidate, lines, parcels]);

  return lines ? <primitive object={lines} /> : null;
}
