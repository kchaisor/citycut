import { useEffect, useRef, useState } from "react";
import { buildingHeightSource, buildingHeightSourceLabel } from "../lib/heightOverrides";
import type { BuildingFeat } from "../types";

type Props = {
  building: BuildingFeat;
  clientX: number;
  clientY: number;
  onSave: (heightM: number) => void;
  onReset: () => void;
  onClose: () => void;
};

export function BuildingHeightPopover({ building, clientX, clientY, onSave, onReset, onClose }: Props) {
  const [value, setValue] = useState(String(building.height));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(String(building.height));
  }, [building.id, building.height]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [building.id]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const source = buildingHeightSourceLabel(buildingHeightSource(building));

  function commit() {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    onSave(parsed);
  }

  return (
    <div
      className="building-height-popover"
      role="dialog"
      aria-label="Building height"
      style={{ left: clientX, top: clientY }}
    >
      <header>
        <strong>Building height</strong>
        <button type="button" className="icon-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      <p className="meta">
        Current: {building.height.toFixed(1)} m · {source}
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
