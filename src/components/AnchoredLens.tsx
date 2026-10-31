import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, type RefObject } from "react";
import * as THREE from "three";
import { effectiveBuildingHeightM } from "../lib/buildingHeightResolve";
import { buildingRoofAnchor } from "../lib/buildingRoofAnchor";
import {
  anchoredLensFloorsLine,
  anchoredLensHeightLine,
  anchoredLensSunHoursLine,
} from "../lib/anchoredLensMetrics";
import type { SunHoursGrid } from "../lib/sunHours";
import type { BuildingFeat, CityModel } from "../types";

export type AnchoredLensMode = "hover" | "pinned";

export type AnchoredLensActions = {
  onRipple: () => void;
  onCut: () => void;
  onViewshed: () => void;
  rippleEnabled: boolean;
  cutEnabled: boolean;
  viewshedEnabled: boolean;
};

type CardProps = {
  building: BuildingFeat;
  model: CityModel;
  sunHoursGrid: SunHoursGrid | null;
  actions: AnchoredLensActions;
  mode: AnchoredLensMode;
};

export function AnchoredLensCard({ building, model, sunHoursGrid, actions, mode }: CardProps) {
  const heightM = effectiveBuildingHeightM(building);
  const heightLine = anchoredLensHeightLine(building);
  const floorsLine = anchoredLensFloorsLine(heightM);
  const sunLine = anchoredLensSunHoursLine(model, building, sunHoursGrid);

  const preview = mode === "hover";

  return (
    <div
      className="anchored-lens-card"
      data-anchored-lens="open"
      data-anchored-lens-mode={mode}
      role={preview ? "status" : "dialog"}
      aria-label={preview ? "Building preview" : "Building lens"}
    >
      <div className="anchored-lens-metrics">
        <p>
          <span className="anchored-lens-k">Height</span>
          <span className="anchored-lens-v">{heightLine}</span>
        </p>
        <p>
          <span className="anchored-lens-k">Floors</span>
          <span className="anchored-lens-v">{floorsLine}</span>
        </p>
        {sunLine ? (
          <p>
            <span className="anchored-lens-k">Sun hours</span>
            <span className="anchored-lens-v">{sunLine}</span>
          </p>
        ) : null}
      </div>
      {preview ? null : (
        <div className="anchored-lens-actions">
          <button
            type="button"
            className="anchored-lens-btn"
            disabled={!actions.rippleEnabled}
            title={actions.rippleEnabled ? undefined : "Coming soon"}
            data-anchored-lens-tip={actions.rippleEnabled ? undefined : "Coming soon"}
            data-anchored-lens-action="ripple"
            onClick={actions.onRipple}
          >
            Ripple from here
          </button>
          <button
            type="button"
            className="anchored-lens-btn"
            disabled={!actions.cutEnabled}
            title={actions.cutEnabled ? undefined : "Coming soon"}
            data-anchored-lens-tip={actions.cutEnabled ? undefined : "Coming soon"}
            data-anchored-lens-action="cut"
            onClick={actions.onCut}
          >
            Cut here
          </button>
          <button
            type="button"
            className="anchored-lens-btn"
            disabled={!actions.viewshedEnabled}
            title={actions.viewshedEnabled ? undefined : "Coming soon"}
            data-anchored-lens-tip={actions.viewshedEnabled ? undefined : "Coming soon"}
            data-anchored-lens-action="viewshed"
            onClick={actions.onViewshed}
          >
            Viewshed
          </button>
        </div>
      )}
    </div>
  );
}

export function AnchoredLensViewportLayer({
  hostRef,
  building,
  model,
  sunHoursGrid,
  actions,
  mode,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  building: BuildingFeat;
  model: CityModel;
  sunHoursGrid: SunHoursGrid | null;
  actions: AnchoredLensActions;
  mode: AnchoredLensMode;
}) {
  return (
    <div ref={hostRef} className="anchored-lens-host" data-anchored-lens-visible="0">
      <AnchoredLensCard building={building} model={model} sunHoursGrid={sunHoursGrid} actions={actions} mode={mode} />
    </div>
  );
}

export function AnchoredLensScreenTracker({
  model,
  building,
  hostRef,
}: {
  model: CityModel;
  building: BuildingFeat;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  const { camera, size } = useThree();
  const world = useMemo(() => buildingRoofAnchor(model, building), [model, building]);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const host = hostRef.current;
    if (!host) return;
    scratch.copy(world);
    scratch.project(camera);
    if (scratch.z > 1) {
      host.dataset.anchoredLensVisible = "0";
      host.style.visibility = "hidden";
      return;
    }
    host.dataset.anchoredLensVisible = "1";
    host.style.visibility = "visible";
    const x = (scratch.x * 0.5 + 0.5) * size.width;
    const y = (-scratch.y * 0.5 + 0.5) * size.height;
    host.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) translate(-50%, calc(-100% - 12px))`;
  });

  return null;
}
