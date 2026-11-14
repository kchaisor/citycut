import type { CSSProperties } from "react";
import { fromLocal } from "../lib/geo";
import { projectLonLat } from "../lib/crs";
import { mgaCrs } from "../lib/crsZone";
import { sampleTerrain } from "../lib/terrain";
import type { CityModel, TreeFeat, TerrainField } from "../types";
import type { InspectHudPlacement } from "../lib/inspectHudLayout";

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p className="building-popup-field">
      <span className="field-label">{label}</span>
      <span className="field-value">{value}</span>
    </p>
  );
}

function hudStyle(screen: InspectHudPlacement | null): CSSProperties | undefined {
  if (!screen) return undefined;
  return {
    position: "fixed",
    left: screen.left,
    top: screen.top,
    right: "auto",
    bottom: "auto",
  };
}

export function TreeInspectHud({
  tree,
  model,
  screen,
  onClose,
}: {
  tree: TreeFeat;
  model: CityModel;
  screen: InspectHudPlacement | null;
  onClose: () => void;
}) {
  const ground = model.terrain ? sampleTerrain(model.terrain, tree.at[0], tree.at[1], model.sideM) : 0;
  const source =
    tree.tier === "vicmap"
      ? "Vicmap Tree Urban"
      : tree.tier === "com"
        ? "City of Melbourne"
        : tree.sizeSource === "osm"
          ? "OSM"
          : tree.sizeSource;
  return (
    <aside
      className="building-detail-panel is-floating inspect-hud"
      style={hudStyle(screen)}
      role="dialog"
      aria-label="Tree details"
    >
      <header>
        <strong>Tree</strong>
        <button type="button" className="icon-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="building-detail-panel-body">
        <Field label="Height" value={`${tree.height_m.toFixed(1)} m`} />
        <Field label="Crown" value={`${tree.crown_diameter_m.toFixed(1)} m dia.`} />
        <Field label="Ground" value={`${ground.toFixed(1)} m AHD`} />
        <Field label="Source" value={source} />
        {tree.species ? <Field label="Species" value={tree.species} /> : null}
      </div>
    </aside>
  );
}

export function TerrainInspectHud({
  east,
  north,
  terrain,
  sideM,
  center,
  screen,
  onClose,
}: {
  east: number;
  north: number;
  terrain?: TerrainField | null;
  sideM: number;
  center: CityModel["center"];
  screen: InspectHudPlacement | null;
  onClose: () => void;
}) {
  const { lat, lon } = fromLocal([east, north], center);
  const zone = mgaCrs(center.lon).zone;
  const [easting, northing] = projectLonLat(lon, lat, zone);
  const elevation = terrain ? sampleTerrain(terrain, east, north, sideM) : 0;
  const slope =
    terrain != null
      ? (() => {
          const step = Math.max(terrain.spacingM, 1);
          const z0 = sampleTerrain(terrain, east, north, sideM);
          const zx = sampleTerrain(terrain, east + step, north, sideM);
          const zn = sampleTerrain(terrain, east, north + step, sideM);
          const grad = Math.hypot(zx - z0, zn - z0) / step;
          return `${((Math.atan(grad) * 180) / Math.PI).toFixed(1)}°`;
        })()
      : "";
  return (
    <aside
      className="building-detail-panel is-floating inspect-hud"
      style={hudStyle(screen)}
      role="dialog"
      aria-label="Terrain details"
    >
      <header>
        <strong>Terrain</strong>
        <button type="button" className="icon-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="building-detail-panel-body">
        <Field label="Elevation" value={`${elevation.toFixed(1)} m AHD`} />
        {slope ? <Field label="Slope" value={slope} /> : null}
        <Field label="Coordinates" value={`${lat.toFixed(5)}°, ${lon.toFixed(5)}°`} />
        <Field label="MGA" value={`${Math.round(easting)} E · ${Math.round(northing)} N (Z${zone})`} />
      </div>
    </aside>
  );
}
