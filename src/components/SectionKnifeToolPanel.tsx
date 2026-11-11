import { useId, useState } from "react";
import { Scissors } from "lucide-react";
import {
  createSectionKnifeEntry,
  selectedKnife,
  type SectionKnifeToolState,
} from "../lib/sectionKnife/state";
import { northClockwiseDegFromPose, poseFromNorthClockwiseDeg } from "../lib/sectionKnife/angleNorth";
import { snapPoseToModel, snapPoseToPreset } from "../lib/sectionKnife/snap";
import type { CityModel } from "../types";

export function SectionKnifeToolPanel({
  sideM,
  model,
  tool,
  onChange,
  onExportSection,
}: {
  sideM: number;
  model: CityModel;
  tool: SectionKnifeToolState;
  onChange: (next: SectionKnifeToolState) => void;
  onExportSection: (applyVerticalExaggeration: boolean) => void;
}) {
  const selected = selectedKnife(tool);
  const offsetId = useId();
  const angleId = useId();
  const snapId = useId();
  const vertExId = useId();
  const [vertExOnExport, setVertExOnExport] = useState(false);

  const updatePose = (pose: typeof selected.pose, snapCue = false) => {
    let nextPose = pose;
    let cue = tool.snapCue;
    if (tool.snap && snapCue) {
      const snap = snapPoseToModel(model, nextPose);
      nextPose = snap.pose;
      if (snap.cue) {
        cue = { kind: snap.cue.kind, east: snap.cue.east, north: snap.cue.north, untilMs: Date.now() + 2200 };
      }
    }
    onChange({
      ...tool,
      snapCue: cue,
      knives: tool.knives.map((knife) => (knife.id === tool.selectedId ? { ...knife, pose: nextPose } : knife)),
    });
  };

  return (
    <section className="sidebar-group section-knife-tools" aria-label="Section Knife">
      <div className="card-head sidebar-gh">
        <h3 className="card-title">Tools</h3>
      </div>
      <button
        type="button"
        className={tool.active ? "shape-btn on section-knife-toggle" : "shape-btn section-knife-toggle"}
        aria-pressed={tool.active}
        onClick={() => onChange({ ...tool, active: !tool.active })}
      >
        <Scissors size={14} strokeWidth={1.75} aria-hidden="true" />
        Section Knife
      </button>
      {tool.active && (
        <>
          <p className="field-note section-knife-mode-note">
            Near side stays shaded; far side draws as light building ink. Cut faces show black poché with floor lines.
          </p>
          <div className="sidebar-gh">
            <h3 className="card-title">Sections</h3>
          </div>
          <ul className="section-knife-list">
            {tool.knives.map((knife) => (
              <li key={knife.id}>
                <button
                  type="button"
                  className={knife.id === tool.selectedId ? "shape-btn on" : "shape-btn"}
                  aria-pressed={knife.id === tool.selectedId}
                  onClick={() => onChange({ ...tool, selectedId: knife.id })}
                >
                  {knife.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="shape-btn section-knife-new"
            onClick={() => {
              const entry = createSectionKnifeEntry(sideM);
              onChange({ ...tool, knives: [...tool.knives, entry], selectedId: entry.id });
            }}
          >
            + New section knife
          </button>
          <div className="section-knife-placement-fields">
            <label className="field-stack" htmlFor={offsetId}>
              <span className="field-label">Offset (m)</span>
              <input
                id={offsetId}
                className="mono section-knife-offset-input"
                type="number"
                step={0.5}
                value={Math.round(selected.pose.offsetM * 10) / 10}
                data-section-knife-offset-input
                onChange={(event) => {
                  const offsetM = Number(event.target.value);
                  if (!Number.isFinite(offsetM)) return;
                  updatePose({ ...selected.pose, offsetM });
                }}
              />
            </label>
            <label className="field-stack" htmlFor={angleId}>
              <span className="field-label">Angle (° from north)</span>
              <input
                id={angleId}
                className="mono section-knife-angle-input"
                type="number"
                step={1}
                value={northClockwiseDegFromPose(selected.pose)}
                data-section-knife-angle-input
                onChange={(event) => {
                  const deg = Number(event.target.value);
                  if (!Number.isFinite(deg)) return;
                  updatePose(poseFromNorthClockwiseDeg(deg, selected.pose.offsetM));
                }}
              />
            </label>
          </div>
          <div className="section-knife-preset-row" role="group" aria-label="Angle presets">
            {([0, 45, 90] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                className="shape-btn section-knife-preset"
                data-section-knife-preset={preset}
                onClick={() => updatePose(snapPoseToPreset(selected.pose, preset))}
              >
                {preset}°
              </button>
            ))}
          </div>
          <label className="check-field" htmlFor={snapId}>
            <input
              id={snapId}
              type="checkbox"
              checked={tool.snap}
              onChange={(event) => onChange({ ...tool, snap: event.target.checked })}
            />
            Snap to street or parcel edge while dragging
          </label>
          <button
            type="button"
            className="shape-btn section-knife-align-edge"
            onClick={() => updatePose(selected.pose, true)}
          >
            Align to edge
          </button>
          {tool.snapCue && tool.snapCue.untilMs > Date.now() ? (
            <p className="field-note section-knife-snap-cue-note" data-section-knife-snap-cue="1">
              Snapped to {tool.snapCue.kind} · {Math.round(tool.snapCue.east)} E, {Math.round(tool.snapCue.north)} N
            </p>
          ) : null}
          <label className="check-field" htmlFor={vertExId}>
            <input
              id={vertExId}
              type="checkbox"
              checked={vertExOnExport}
              onChange={(event) => setVertExOnExport(event.target.checked)}
            />
            Apply HUD vertical exaggeration on section export
          </label>
          <button
            type="button"
            className="shape-btn section-knife-export"
            data-section-knife-export
            onClick={() => onExportSection(vertExOnExport)}
          >
            Export section (SVG + .3dm)
          </button>
          <p
            className="field-note"
            data-section-knife-offset-m={selected.pose.offsetM.toFixed(3)}
            data-section-knife-angle-rad={selected.pose.angleRad.toFixed(4)}
          >
            Drag the yellow handle to move the plane; use the ring at the base to rotate. Hold Shift to disable snap while dragging.
            {selected.label} · offset {selected.pose.offsetM.toFixed(1)} m
          </p>
        </>
      )}
    </section>
  );
}
