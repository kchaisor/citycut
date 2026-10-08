import { useEffect, useRef, useState } from "react";
import { buildingHeightSource, buildingHeightSourceLabel } from "../lib/heightOverrides";
import {
  emptyBuildingPopupDetails,
  isCityOfMelbourne,
  loadBuildingPopupDetails,
  type BuildingPopupDetails,
} from "../lib/buildingPopupLookup";
import { interiorPoint } from "../lib/useCascade";
import { fromLocal } from "../lib/geo";
import type { BuildingFeat, LonLat } from "../types";

type Props = {
  building: BuildingFeat;
  center: LonLat;
  onSave: (heightM: number) => void;
  onReset: () => void;
  onClose: () => void;
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

export function BuildingHeightPopover({ building, center, onSave, onReset, onClose }: Props) {
  const [value, setValue] = useState(() => formatHeightM(building.height));
  const [details, setDetails] = useState<BuildingPopupDetails>(() => emptyBuildingPopupDetails(building));
  const [minimised, setMinimised] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(formatHeightM(building.height));
    setDetails(emptyBuildingPopupDetails(building));
    setMinimised(false);
    const controller = new AbortController();
    void loadBuildingPopupDetails(building, center, controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setDetails(loaded);
    });
    return () => controller.abort();
  }, [building.id, building.height, building.use, building.source, center.lat, center.lon]);

  useEffect(() => {
    if (minimised) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [building.id, minimised]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const source = buildingHeightSourceLabel(buildingHeightSource(building));
  const at = interiorPoint(building.ring, building.holes);
  const { lat, lon } = fromLocal(at, center);
  const showCom = isCityOfMelbourne(lat, lon);

  function commit() {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSave(parsed);
  }

  return (
    <aside
      className={minimised ? "building-detail-panel is-minimised" : "building-detail-panel"}
      role="dialog"
      aria-label="Building details"
    >
      <header>
        <strong>Building</strong>
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
          <button type="button" className="icon-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
      </header>
      {!minimised && (
        <div className="building-detail-panel-body">
          <Field label="Use" value={details.useLine} />
          <Field label="Name / address" value={details.nameLine} />
          <Field label="Height & storeys" value={details.heightStoreysLine} />
          <Field label="Zone & overlays" value={details.zoneLine} />
          <Field label="Lot / site" value={details.lotLine} />
          {showCom && <Field label="Year built" value={details.yearLine} />}
          {showCom && <Field label="Development" value={details.developmentLine} />}
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
