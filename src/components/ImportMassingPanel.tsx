import { useRef, useState } from "react";
import { ChevronRight, Eye, EyeOff } from "lucide-react";
import type { ImportedMassing, ImportedMassingBuilding, MassingPlacement } from "../lib/massingImport";
import {
  buildingGroupingNote,
  groupMassingBuildings,
  LEGACY_SINGLE_BUILDING_NOTE,
  massingBuildingColour,
  massingBuildingMeta,
  schemeHeading,
} from "../lib/massingBuildings";
import { getColour } from "../lib/colours";
import type { ImportedBuildingRef } from "../types";

type Props = {
  imported: ImportedMassing[];
  warnings: Map<string, string[]>;
  crsName: string;
  placingId: string | null;
  busy: boolean;
  error: string | null;
  selected?: ImportedBuildingRef | null;
  onImport: (file: File) => void;
  onMode: (id: string, mode: "mga" | "click") => void;
  onPlacement: (id: string, placement: MassingPlacement) => void;
  onSnap: (id: string) => void;
  onResetMga: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onAllVisible?: (visible: boolean) => void;
  onBuildingsVisible?: (id: string, buildingIds: string[], visible: boolean) => void;
  onSelectBuilding?: (id: string, buildingId: string, clientX: number, clientY: number) => void;
  onColour: (id: string, colour: string | null) => void;
  onRemove: (id: string) => void;
};

function NumberField({
  label,
  value,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="massing-field">
      <span>{label}</span>
      <input
        key={value}
        type="number"
        step={step}
        defaultValue={value.toFixed(2)}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

function EyeToggle({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="massing-eye"
      aria-pressed={on}
      aria-label={`${on ? "Hide" : "Show"} ${label}`}
      title={`${on ? "Hide" : "Show"} ${label}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {on ? <Eye size={16} strokeWidth={1.75} aria-hidden="true" /> : <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />}
    </button>
  );
}

export function massingGroupingLine(item: Pick<ImportedMassing, "notes" | "buildings">): string {
  return item.notes.includes(LEGACY_SINGLE_BUILDING_NOTE) ? LEGACY_SINGLE_BUILDING_NOTE : buildingGroupingNote(item.buildings);
}

export function formatFileSize(bytes: number): string {
  return bytes < 102_400 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function placementSummary(item: Pick<ImportedMassing, "mode" | "placement">): string {
  return [
    item.mode === "mga" ? "MGA 2020" : "Placed by click",
    `E ${item.placement.e.toFixed(2)}`,
    `N ${item.placement.n.toFixed(2)}`,
  ].join(" · ");
}

function BuildingRow({
  item,
  building,
  selected,
  onSelect,
  onVisible,
}: {
  item: ImportedMassing;
  building: ImportedMassingBuilding;
  selected: boolean;
  onSelect?: (clientX: number, clientY: number) => void;
  onVisible?: (visible: boolean) => void;
}) {
  const unclassified = !item.colour && !building.colour && building.use == null;
  return (
    <li
      className={["massing-building-row", building.visible ? "" : "is-hidden", selected ? "is-selected" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        type="button"
        className="massing-building-main"
        aria-current={selected ? "true" : undefined}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onSelect?.(rect.right + 16, rect.top);
        }}
      >
        <span
          className={unclassified ? "massing-swatch is-unclassified" : "massing-swatch"}
          data-swatch={unclassified ? "unclassified" : "use"}
          style={{ backgroundColor: massingBuildingColour(item, building) }}
          aria-hidden="true"
        />
        <span className="massing-building-text">
          <span className="massing-building-name">{building.name}</span>
          <span className="massing-building-meta" title={massingBuildingMeta(building)}>
            {massingBuildingMeta(building)}
          </span>
        </span>
      </button>
      <EyeToggle on={building.visible} label={building.name} onToggle={() => onVisible?.(!building.visible)} />
    </li>
  );
}

export function ImportMassingPanel(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [placementOpen, setPlacementOpen] = useState<Set<string>>(() => new Set());
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const { imported, warnings, crsName, placingId, busy, error, selected = null } = props;
  const anyVisible = imported.some((item) => item.visible);
  return (
    <div className="import-massing-panel">
      <p className="legend-note">
        {imported.length} imported model{imported.length === 1 ? "" : "s"} · .3dm only · up to 50 MB, 500k triangles, 20
        models
      </p>
      <p className="legend-note import-crs-note">
        Position geometry in <strong>{crsName}</strong> coordinates (metres, matching this cut&apos;s .3dm export) so
        imported models land in the exact site location.
      </p>
      <div className="panel-toolbar">
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? "Reading…" : "Import .3dm…"}
        </button>
      </div>
      {error && <p className="massing-warning is-error">{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept=".3dm"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onImport(file);
        }}
      />
      {imported.length > 0 && (
        <div className="massing-section-head">
          <span className="massing-micro">Import</span>
          <span className="massing-count">
            {imported.length} model{imported.length === 1 ? "" : "s"}
          </span>
          <EyeToggle
            on={anyVisible}
            label={imported.length === 1 ? "model" : "all models"}
            onToggle={() => props.onAllVisible?.(!anyVisible)}
          />
        </div>
      )}
      {imported.map((item) => {
        const open = placementOpen.has(item.id);
        const single = Boolean(item.colour);
        const colour = item.colour ?? getColour("--imported-massing");
        return (
          <div key={item.id} className="massing-item">
            <p className="massing-file-name">{item.name}</p>
            <p className="massing-file-meta">
              {formatFileSize(item.fileBytes)} · {item.triangles.toLocaleString()} triangles
            </p>
            <p className="massing-file-meta">{massingGroupingLine(item)}</p>
            {groupMassingBuildings(item.buildings).map((group) => {
              const ids = group.buildings.map((building) => building.id);
              const groupVisible = group.buildings.some((building) => building.visible);
              return (
                <div key={group.scheme ?? ""} className="massing-scheme" role="group" aria-label={group.scheme ?? item.name}>
                  {group.scheme != null && (
                    <div className="massing-scheme-head">
                      <span className="massing-scheme-title" title={group.scheme.split("::").join(" › ")}>
                        {schemeHeading(group.scheme)} · {group.buildings.length}
                      </span>
                      <EyeToggle
                        on={groupVisible}
                        label={`every building in ${schemeHeading(group.scheme)}`}
                        onToggle={() => props.onBuildingsVisible?.(item.id, ids, !groupVisible)}
                      />
                    </div>
                  )}
                  <ul className="massing-building-list">
                    {group.buildings.map((building) => (
                      <BuildingRow
                        key={building.id}
                        item={item}
                        building={building}
                        selected={selected?.fileId === item.id && selected.buildingId === building.id}
                        onSelect={(clientX, clientY) => props.onSelectBuilding?.(item.id, building.id, clientX, clientY)}
                        onVisible={(visible) => props.onBuildingsVisible?.(item.id, [building.id], visible)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
            <button
              type="button"
              className="massing-placement-summary"
              aria-expanded={open}
              onClick={() =>
                setPlacementOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })
              }
            >
              <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" className="massing-chevron" />
              <span className="massing-placement-text" title={placementSummary(item)}>
                {placementSummary(item)}
              </span>
            </button>
            {open && (
              <div className="massing-placement">
                <div className="massing-mode" role="group" aria-label="Placement">
                  <button type="button" aria-pressed={item.mode === "mga"} onClick={() => props.onMode(item.id, "mga")}>
                    MGA 2020 coordinates
                  </button>
                  <button type="button" aria-pressed={item.mode === "click"} onClick={() => props.onMode(item.id, "click")}>
                    {placingId === item.id ? "Click in the model…" : "Click to place"}
                  </button>
                </div>
                <p className="meta">
                  {item.mode === "mga"
                    ? `${crsName}, metres, Z = CityCut's terrain height: the frame of CityCut's own .3dm export.`
                    : "Click the 3D model to drop the base centre there, then adjust."}
                </p>
                <div className="massing-grid">
                  <NumberField
                    label="Easting (m)"
                    value={item.placement.e}
                    step={0.5}
                    onCommit={(e) => props.onPlacement(item.id, { ...item.placement, e })}
                  />
                  <NumberField
                    label="Northing (m)"
                    value={item.placement.n}
                    step={0.5}
                    onCommit={(n) => props.onPlacement(item.id, { ...item.placement, n })}
                  />
                  <NumberField
                    label="Base Z (m)"
                    value={item.placement.base}
                    step={0.1}
                    onCommit={(base) => props.onPlacement(item.id, { ...item.placement, base })}
                  />
                  <NumberField
                    label="Rotation (°)"
                    value={item.placement.rotDeg}
                    step={1}
                    onCommit={(rotDeg) => props.onPlacement(item.id, { ...item.placement, rotDeg })}
                  />
                </div>
                <div className="panel-toolbar">
                  <button type="button" onClick={() => props.onSnap(item.id)}>
                    Snap base to ground
                  </button>
                  <button type="button" onClick={() => props.onResetMga(item.id)}>
                    Reset to MGA
                  </button>
                </div>
              </div>
            )}
            {(warnings.get(item.id) ?? []).map((warning) => (
              <p key={warning} className="massing-warning">
                ⚠ {warning}
              </p>
            ))}
            <p className="massing-micro massing-colour-head">Colour</p>
            <div className="massing-colour-mode" role="group" aria-label="Colour">
              <button type="button" aria-pressed={!single} onClick={() => props.onColour(item.id, null)}>
                By use
              </button>
              <button
                type="button"
                aria-pressed={single}
                onClick={() => {
                  if (!single) props.onColour(item.id, colour);
                }}
              >
                Single colour
              </button>
            </div>
            <p className="massing-helper">Single colour recolours every building and overrides use colours.</p>
            {single && (
              <label className="massing-field massing-colour">
                <span>Colour</span>
                <input
                  type="color"
                  aria-label={`Colour of ${item.name}`}
                  value={colour.toLowerCase()}
                  onChange={(event) => props.onColour(item.id, event.target.value)}
                />
                <code>{colour.toUpperCase()}</code>
              </label>
            )}
            <label className="massing-check">
              <input type="checkbox" checked={item.visible} onChange={() => props.onToggleVisible(item.id)} />
              <span>Show in views and .3dm export</span>
            </label>
            <div className="massing-remove">
              {confirmRemove === item.id ? (
                <>
                  <span>Remove {item.name}?</span>
                  <button type="button" className="massing-text-button is-strong" onClick={() => props.onRemove(item.id)}>
                    Remove
                  </button>
                  <button type="button" className="massing-text-button" onClick={() => setConfirmRemove(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="massing-text-button" onClick={() => setConfirmRemove(item.id)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
