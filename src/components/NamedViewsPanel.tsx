import { Check, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { isPngExportable, type NamedView } from "../lib/namedViews";
import type { WindSheetFraming } from "../lib/sheetFraming";
import { isWindSheetView } from "../lib/windSheet";

export type NamedViewsBusy = "selected" | "all" | null;

export type NamedViewsPanelProps = {
  views: readonly NamedView[];
  busy: NamedViewsBusy;
  warning: string | null;
  onSave: (name: string) => boolean;
  onRestore: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExportSelected: (ids: string[], highQuality: boolean, framing: WindSheetFraming) => void;
  onExportAll: (highQuality: boolean, framing: WindSheetFraming) => void;
  windSheetFraming: WindSheetFraming;
  onWindSheetFramingChange: (framing: WindSheetFraming) => void;
};

const FRAMING_OPTIONS: ReadonlyArray<{ id: WindSheetFraming; label: string }> = [
  { id: "whole-site", label: "Whole site" },
  { id: "saved", label: "Saved zoom" },
];

function viewMeta(view: NamedView): string {
  const { tab, view: camera } = view.snapshot;
  if (tab === "satellite") return "Satellite";
  if (tab === "drawing") return "Drawing";
  return camera.projection === "perspective" ? "3D · Perspective" : camera.projection === "plan" ? "3D · Plan" : "3D · Isometric";
}

export function NamedViewsPanel(props: NamedViewsPanelProps) {
  const { views, busy, warning } = props;
  const [name, setName] = useState("");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [highQuality, setHighQuality] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const tickedIds = views.filter((view) => ticked.has(view.id)).map((view) => view.id);
  const exporting = busy !== null;
  const hasWindSheet = views.some((view) => isPngExportable(view) && isWindSheetView(view.snapshot));

  function submitSave(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    if (props.onSave(name)) setName("");
  }

  function commitRename() {
    if (!renaming) return;
    if (renaming.text.trim()) props.onRename(renaming.id, renaming.text);
    setRenaming(null);
  }

  function toggleTick(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="import-massing-panel named-views-panel" data-named-views-count={views.length}>
      <p className="massing-micro">Save current view</p>
      <form className="named-views-save" onSubmit={submitSave}>
        <input
          type="text"
          value={name}
          maxLength={80}
          placeholder="View name"
          aria-label="View name"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="named-views-primary" disabled={!name.trim()}>
          Save
        </button>
      </form>
      <div className="massing-section-head">
        <span className="massing-micro">Saved views</span>
        <span className="massing-count">
          {views.length} view{views.length === 1 ? "" : "s"}
        </span>
      </div>
      {views.length === 0 ? (
        <p className="massing-helper named-views-empty">
          No saved views for this cut yet. Frame the model, switch on what you want to see, name it, and save.
        </p>
      ) : (
        <ul className="named-views-list">
          {views.map((view) => (
            <li key={view.id} className="named-views-row">
              <input
                type="checkbox"
                className="named-views-tick"
                aria-label={`Tick ${view.name}`}
                checked={ticked.has(view.id)}
                onChange={() => toggleTick(view.id)}
              />
              {renaming?.id === view.id ? (
                <input
                  type="text"
                  className="named-views-rename"
                  aria-label={`New name for ${view.name}`}
                  autoFocus
                  value={renaming.text}
                  maxLength={80}
                  onChange={(event) => setRenaming({ id: view.id, text: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitRename();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <button type="button" className="named-views-name" title={view.name} onClick={() => props.onRestore(view.id)}>
                  <span className="massing-building-name">{view.name}</span>
                  <span className="massing-building-meta">
                    {viewMeta(view)}
                    {isPngExportable(view) ? "" : " · restore only"}
                  </span>
                </button>
              )}
              {renaming?.id === view.id ? (
                <button type="button" className="massing-eye" aria-label={`Save name for ${view.name}`} onClick={commitRename}>
                  <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : confirmDelete === view.id ? (
                <>
                  <button
                    type="button"
                    className="massing-text-button is-strong"
                    onClick={() => {
                      setConfirmDelete(null);
                      setTicked((prev) => {
                        const next = new Set(prev);
                        next.delete(view.id);
                        return next;
                      });
                      props.onDelete(view.id);
                    }}
                  >
                    Delete
                  </button>
                  <button type="button" className="massing-text-button" onClick={() => setConfirmDelete(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="massing-eye"
                    aria-label={`Rename ${view.name}`}
                    onClick={() => setRenaming({ id: view.id, text: view.name })}
                  >
                    <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="massing-eye"
                    aria-label={`Delete ${view.name}`}
                    onClick={() => setConfirmDelete(view.id)}
                  >
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="massing-micro named-views-export-head">Export PNG</p>
      <label className="named-views-quality">
        <input type="checkbox" checked={highQuality} disabled={exporting} onChange={(event) => setHighQuality(event.target.checked)} />
        <span>High quality, transparent</span>
      </label>
      {hasWindSheet && (
        <>
          <p className="massing-micro">A3 map framing</p>
          <div className="ac-seg ac-seg-2" role="group" aria-label="A3 map framing">
            {FRAMING_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={props.windSheetFraming === option.id ? "ac-seg-btn is-ink" : "ac-seg-btn"}
                aria-pressed={props.windSheetFraming === option.id}
                disabled={exporting}
                onClick={() => props.onWindSheetFramingChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="named-views-export">
        <button
          type="button"
          className="named-views-primary"
          disabled={tickedIds.length === 0 || exporting}
          onClick={() => props.onExportSelected(tickedIds, highQuality, props.windSheetFraming)}
        >
          {busy === "selected" ? "Exporting…" : "Export selected"}
        </button>
        <button
          type="button"
          className="named-views-primary"
          disabled={views.length === 0 || exporting}
          onClick={() => props.onExportAll(highQuality, props.windSheetFraming)}
        >
          {busy === "all" ? "Exporting…" : "Export all"}
        </button>
      </div>
      <p className="massing-helper">One view downloads as a PNG; several download as a zip. Only 3D views export. High quality renders at 3x on a transparent background. Plan wind sheets can frame the whole site or keep the saved zoom.</p>
      {warning && <p className="massing-warning is-error" role="alert">{warning}</p>}
    </div>
  );
}
