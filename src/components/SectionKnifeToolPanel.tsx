import { Scissors } from "lucide-react";
import {
  createSectionKnifeEntry,
  selectedKnife,
  type SectionKnifeToolState,
} from "../lib/sectionKnife/state";

export function SectionKnifeToolPanel({
  sideM,
  tool,
  onChange,
}: {
  sideM: number;
  tool: SectionKnifeToolState;
  onChange: (next: SectionKnifeToolState) => void;
}) {
  const selected = selectedKnife(tool);

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
          <p
            className="field-note"
            data-section-knife-offset-m={selected.pose.offsetM.toFixed(3)}
            data-section-knife-angle-rad={selected.pose.angleRad.toFixed(4)}
          >
            Drag the yellow handle to move the plane; use the ring at the base to rotate about the vertical axis.
            {selected.label} · offset {selected.pose.offsetM.toFixed(1)} m
          </p>
        </>
      )}
    </section>
  );
}
