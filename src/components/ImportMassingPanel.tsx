import { useRef } from "react";
import type { ImportedMassing, MassingPlacement } from "../lib/massingImport";
import { getColour } from "../lib/colours";

type Props = {
  imported: ImportedMassing[];
  warnings: Map<string, string[]>;
  crsName: string;
  placingId: string | null;
  busy: boolean;
  error: string | null;
  onImport: (file: File) => void;
  onMode: (id: string, mode: "mga" | "click") => void;
  onPlacement: (id: string, placement: MassingPlacement) => void;
  onSnap: (id: string) => void;
  onResetMga: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onColour: (id: string, colour: string) => void;
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

/** Import a Rhino .3dm massing model and place it at MGA or by clicking. */
export function ImportMassingPanel(props: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { imported, warnings, crsName, placingId, busy, error } = props;
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
      {imported.map((item) => (
        <div key={item.id} className="massing-item">
          <p className="massing-name">
            <strong>{item.name}</strong>{" "}
            <span className="meta">
              {(item.fileBytes / 1048576).toFixed(1)} MB · {item.triangles.toLocaleString()} triangles
            </span>
          </p>
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
          {(warnings.get(item.id) ?? []).map((warning) => (
            <p key={warning} className="massing-warning">
              ⚠ {warning}
            </p>
          ))}
          <label className="massing-field massing-colour">
            <span>Colour</span>
            <input
              type="color"
              aria-label={`Colour of ${item.name}`}
              value={(item.colour ?? getColour("--imported-massing")).toLowerCase()}
              onChange={(event) => props.onColour(item.id, event.target.value)}
            />
            <code>{(item.colour ?? getColour("--imported-massing")).toUpperCase()}</code>
          </label>
          <div className="panel-toolbar">
            <button type="button" aria-pressed={item.visible} onClick={() => props.onToggleVisible(item.id)}>
              {item.visible ? "Shown (in view and .3dm)" : "Hidden"}
            </button>
            <button type="button" onClick={() => props.onRemove(item.id)}>
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
