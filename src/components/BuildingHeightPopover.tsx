import type { HiddenBuilding } from "../lib/hiddenBuildings";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { INSPECT_HUD_MARGIN } from "../lib/inspectHudLayout";
import { landmarkRows, wikidataItemUrl } from "../lib/landmarkLabels";
import type { WikidataLandmark } from "../lib/wikidataLandmarks";
import { buildingHeightSourceLabelForBuilding } from "../lib/heightOverrides";
import {
  emptyBuildingPopupDetails,
  isCityOfMelbourne,
  loadBuildingPopupDetails,
  type BuildingPopupDetails,
} from "../lib/buildingPopupLookup";
import { interiorPoint } from "../lib/useCascade";
import { fromLocal } from "../lib/geo";
import type { DamFloorRecord } from "../lib/comDevelopmentFloors";
import { footprintArea } from "../lib/useCascade";
import type { BuildingFeat, LonLat } from "../types";
import type { ImportedMassingBuilding, MassingBuildingUse } from "../lib/massingImport";
import {
  formatMassingHeight,
  isMassingBuildingUse,
  massingBuildingUses,
  massingLayerDisplay,
  massingSourceLine,
  massingUseLabel,
} from "../lib/massingBuildings";

type Props = {
  building: BuildingFeat;
  landmark?: WikidataLandmark | null;
  center: LonLat;
  allBuildings?: BuildingFeat[];
  damRecords?: DamFloorRecord[];
  onSave: (heightM: number) => void;
  onReset: () => void;
  onClose: () => void;
  selectedCount?: number;
  hiddenCount?: number;
  onHideSelected?: () => void;
  onShowAll?: () => void;
  floatingScreen?: { left: number; top: number } | null;
};

function formatHeightM(height: number): string {
  return height.toFixed(1);
}

function Field({ label, value }: { label: string; value: string }) {
  if (value === "") return null;
  return (
    <p className="building-popup-field">
      <span className="field-label">{label}</span>
      <span className="field-value">{value || "…"}</span>
    </p>
  );
}

export function LandmarkBlock({
  landmark,
  buildingName,
  modelHeightM,
}: {
  landmark: WikidataLandmark;
  buildingName: string;
  modelHeightM: number;
}) {
  const rows = landmarkRows(landmark, buildingName, modelHeightM);
  return (
    <section className="landmark-block" aria-label="Landmark">
      <h4 className="landmark-head">Landmark</h4>
      {rows.map((row) => (
        <p key={row.label} className="landmark-row">
          <span className="landmark-row-label">{row.label}</span>
          <span className={row.numeric ? "landmark-row-value is-numeric" : "landmark-row-value"}>{row.value}</span>
        </p>
      ))}
      <a className="landmark-source" href={wikidataItemUrl(landmark.qid)} target="_blank" rel="noopener noreferrer">
        Wikidata ↗
      </a>
    </section>
  );
}

export function BuildingHeightPopover({
  building,
  landmark = null,
  center,
  allBuildings,
  damRecords,
  onSave,
  onReset,
  onClose,
  selectedCount = 1,
  hiddenCount = 0,
  onHideSelected,
  onShowAll,
  floatingScreen = null,
}: Props) {
  const [value, setValue] = useState(() => formatHeightM(building.height));
  const [details, setDetails] = useState<BuildingPopupDetails>(() => emptyBuildingPopupDetails(building));
  const [minimised, setMinimised] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(formatHeightM(building.height));
    setDetails(emptyBuildingPopupDetails(building));
    setMinimised(false);
    const controller = new AbortController();
    void loadBuildingPopupDetails(building, center, controller.signal, {
      allBuildings,
      damRecords,
    }).then((loaded) => {
      if (!controller.signal.aborted) setDetails(loaded);
    });
    return () => controller.abort();
  }, [
    building.id,
    building.height,
    building.use,
    building.source,
    center.lat,
    center.lon,
    allBuildings,
    damRecords,
  ]);

  useEffect(() => {
    if (minimised) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [building.id, minimised]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const source = buildingHeightSourceLabelForBuilding(building);
  const at = interiorPoint(building.ring, building.holes);
  const { lat, lon } = fromLocal(at, center);
  const showCom = isCityOfMelbourne(lat, lon);
  const levelsValue =
    building.numFloors != null
      ? `${building.numFloors}`
      : building.developmentFloors != null
        ? `${building.developmentFloors}`
        : "";
  const footprintM2 = footprintArea(building.ring, building.holes);
  const footprintValue = footprintM2 >= 4 ? `${Math.round(footprintM2)} m²` : "";
  const heightReadout = `${building.height.toFixed(1)} m`;
  const nameLine = details.nameLine !== "—" ? details.nameLine : building.overtureName ?? "";

  function commit() {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSave(parsed);
  }

  const panelClass = [
    "building-detail-panel",
    floatingScreen ? "is-floating inspect-hud" : "",
    minimised ? "is-minimised" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside
      className={panelClass}
      role="dialog"
      aria-label="Building details"
      style={
        floatingScreen
          ? {
              left: floatingScreen.left,
              top: floatingScreen.top,
              right: "auto",
              bottom: "auto",
              maxHeight: `min(72vh, 460px, calc(100vh - ${floatingScreen.top + INSPECT_HUD_MARGIN}px))`,
            }
          : undefined
      }
    >
      <header>
        <strong>
          Building
          {selectedCount > 1 ? ` · ${selectedCount} selected` : ""}
          {hiddenCount > 0 && <span className="hidden-count-chip">{hiddenCount} hidden</span>}
        </strong>
        <div className="building-detail-panel-actions">
          <button
            type="button"
            className="icon-minimise"
            aria-label={minimised ? "Expand panel" : "Minimise panel"}
            aria-expanded={!minimised}
            onClick={() => setMinimised((open) => !open)}
          >
            {minimised ? "▴" : "▾"}
          </button>
          <button type="button" className="icon-close" aria-label="Close" title="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </header>
      {!minimised && (
        <div className="building-detail-panel-body" ref={bodyRef}>
          {onHideSelected && (
            <div className="hide-buildings-block">
              <p className="hide-buildings-hint">
                Hold Shift and click to add more buildings, then press Hide selected.
              </p>
              <div className="popover-actions">
                <button type="button" className="is-accent" onClick={onHideSelected}>
                  Hide selected ({selectedCount})
                </button>
                <button type="button" onClick={onShowAll} disabled={hiddenCount === 0}>
                  Show all
                </button>
              </div>
            </div>
          )}
          <Field label="Use" value={details.useLine !== "—" ? details.useLine : building.use.replace(/_/g, " ")} />
          <Field label="Name / address" value={nameLine} />
          <Field label="Height" value={heightReadout} />
          <Field
            label="Levels"
            value={
              levelsValue ||
              (details.heightStoreysLine.match(/(\d+)\s*storeys/)?.[1] ?? "")
            }
          />
          <Field label="Footprint" value={footprintValue} />
          <Field label="Zone & overlays" value={details.zoneLine !== "—" ? details.zoneLine : building.zoneCode ?? ""} />
          {showCom && details.yearLine !== "—" ? <Field label="Year built" value={details.yearLine} /> : null}
          {showCom && details.developmentLine !== "—" ? <Field label="Development" value={details.developmentLine} /> : null}
          {landmark && <LandmarkBlock landmark={landmark} buildingName={nameLine} modelHeightM={building.height} />}
          <div className="height-editor-block">
            <p className="meta">
              Height editor · Current: {building.height.toFixed(1)} m · {source}
            </p>
            <label className="height-field">
              <span>Height (m)</span>
              <input
                ref={inputRef}
                type="number"
                min={1}
                step={0.5}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit();
                  }
                }}
              />
            </label>
            <div className="popover-actions">
              <button type="button" onClick={commit}>
                Save
              </button>
              <button type="button" onClick={onReset}>
                Reset this building
              </button>
            </div>
          </div>
          {details.credits.length > 0 && (
            <p className="legend-note popup-credits">{details.credits.join(" ")}</p>
          )}
        </div>
      )}
    </aside>
  );
}

function floatingStyle(floatingScreen: { left: number; top: number } | null) {
  return floatingScreen
    ? {
        left: floatingScreen.left,
        top: floatingScreen.top,
        right: "auto",
        bottom: "auto",
        maxHeight: `min(72vh, 460px, calc(100vh - ${floatingScreen.top + INSPECT_HUD_MARGIN}px))`,
      }
    : undefined;
}

export function ImportedBuildingPopover({
  building,
  fileName,
  onSetUse,
  onClose,
  floatingScreen = null,
}: {
  building: ImportedMassingBuilding;
  fileName: string;
  onSetUse: (use: MassingBuildingUse) => void;
  onClose: () => void;
  floatingScreen?: { left: number; top: number } | null;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const layer = massingLayerDisplay(building);
  return (
    <aside
      className={["building-detail-panel", "is-imported", floatingScreen ? "is-floating inspect-hud" : ""]
        .filter(Boolean)
        .join(" ")}
      role="dialog"
      aria-label={`${building.name} details`}
      style={floatingStyle(floatingScreen)}
    >
      <header>
        <strong className="imported-popover-title">{building.name}</strong>
        <button type="button" className="icon-close" aria-label="Close" title="Close" onClick={onClose}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </header>
      <div className="building-detail-panel-body">
        <div className="imported-popover-row">
          <span className="imported-popover-label">Use</span>
          <span className={building.use ? "imported-popover-value" : "imported-popover-value is-empty"}>
            {building.use ? massingUseLabel(building.use) : "Not set"}
          </span>
        </div>
        <div className="imported-popover-aside">
          <select
            className="imported-popover-select"
            aria-label={building.use ? "Change use" : "Set use"}
            value=""
            onChange={(event) => {
              if (isMassingBuildingUse(event.target.value)) onSetUse(event.target.value);
            }}
          >
            <option value="" disabled>
              {building.use ? "Change use" : "Set use"}
            </option>
            {massingBuildingUses().map((use) => (
              <option key={use} value={use}>
                {massingUseLabel(use)}
              </option>
            ))}
          </select>
        </div>
        <div className="imported-popover-row">
          <span className="imported-popover-label">Height</span>
          <span className="imported-popover-value is-numeric">{formatMassingHeight(building.height)}</span>
        </div>
        <div className="imported-popover-row">
          <span className="imported-popover-label">Levels</span>
          <span className={building.levels != null ? "imported-popover-value is-numeric" : "imported-popover-value is-numeric is-empty"}>
            {building.levels != null ? building.levels : "—"}
          </span>
        </div>
        {building.levels == null && <p className="imported-popover-aside imported-popover-caption">Not in model</p>}
        {layer && (
          <div className="imported-popover-row">
            <span className="imported-popover-label">Layer</span>
            <span className="imported-popover-value">{layer}</span>
          </div>
        )}
        <p className="imported-popover-source">{massingSourceLine(fileName)}</p>
      </div>
    </aside>
  );
}

export function HiddenBuildingsPanel({
  hidden,
  onShow,
  onShowAll,
}: {
  hidden: HiddenBuilding[];
  onShow: (entry: HiddenBuilding) => void;
  onShowAll: () => void;
}) {
  return (
    <div className="hidden-buildings-panel">
      <p className="legend-note">
        {hidden.length.toLocaleString()} hidden building{hidden.length === 1 ? "" : "s"}
        {hidden.length === 0 ? " · select a building, then Hide selected" : ""}
      </p>
      {hidden.length > 0 && (
        <>
          <ul className="hidden-buildings-list">
            {hidden.map((entry, index) => (
              <li key={`${entry.overtureId ?? entry.centroid.join(",")}-${index}`}>
                <span>{entry.label ?? "Building"}</span>
                <button type="button" onClick={() => onShow(entry)}>
                  Show
                </button>
              </li>
            ))}
          </ul>
          <div className="panel-toolbar">
            <button type="button" onClick={onShowAll}>
              Show all
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export type HeightOverridePanelProps = {
  manualCount: number;
  unmatchedCount: number;
  showManualEdits: boolean;
  onToggleShowManual: () => void;
  onResetAll: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
};

export function HeightOverridePanel({
  manualCount,
  unmatchedCount,
  showManualEdits,
  onToggleShowManual,
  onResetAll,
  onExport,
  onImport,
}: HeightOverridePanelProps) {
  const importRef = useRef<HTMLInputElement>(null);

  return (
    <div className="height-override-panel">
      <p className="legend-note">
        {manualCount.toLocaleString()} manual height{manualCount === 1 ? "" : "s"}
        {unmatchedCount > 0 ? ` · ${unmatchedCount} edit${unmatchedCount === 1 ? "" : "s"} not found` : ""}
      </p>
      <div className="panel-toolbar">
        <button type="button" aria-pressed={showManualEdits} onClick={onToggleShowManual}>
          {showManualEdits ? "Show manual edits" : "Hide manual edits"}
        </button>
        <button type="button" onClick={onResetAll} disabled={manualCount === 0}>
          Reset all
        </button>
        <button type="button" onClick={onExport} disabled={manualCount === 0}>
          Export edits
        </button>
        <button type="button" onClick={() => importRef.current?.click()}>
          Import edits
        </button>
      </div>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onImport(file);
        }}
      />
    </div>
  );
}
