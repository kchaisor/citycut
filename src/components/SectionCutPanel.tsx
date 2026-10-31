import { FlipHorizontal2, Plus, RotateCcw, RotateCw, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  activeCut,
  addSectionCut,
  formatOffset,
  lookingDirection,
  MAX_SECTION_CUTS,
  removeSectionCut,
  rotateAngle,
  sectionTitle,
  type SectionCutStore,
  type SectionFill,
} from "../lib/sectionCut";
import type { SectionProfile } from "../lib/sectionProfile";

const FILLS: readonly [SectionFill, string][] = [
  ["solid", "Poché"],
  ["hatch", "Hatch"],
];

export function useSectionSet(store: SectionCutStore) {
  return useSyncExternalStore(store.subscribe, store.getSet);
}

function titleUse(use: string): string {
  const text = use.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function SectionCutToggle({ store, onOpen }: { store: SectionCutStore; onOpen?: () => void }) {
  const set = useSectionSet(store);
  return (
    <button
      type="button"
      className={set.enabled ? "proj-btn active studio-submode-pill is-active section-cut-toggle" : "proj-btn studio-submode-pill section-cut-toggle"}
      aria-pressed={set.enabled}
      onClick={() => {
        store.set({ enabled: !set.enabled });
        if (!set.enabled) onOpen?.();
      }}
    >
      Section cut
    </button>
  );
}

export function SectionsTab({ store, profile, is3d }: { store: SectionCutStore; profile: SectionProfile | null; is3d: boolean }) {
  const set = useSectionSet(store);
  const cut = activeCut(set);
  const looking = lookingDirection(cut);
  if (!set.enabled) {
    return (
      <div className="sections-tab sections-empty">
        <p className="sections-lede">Slice the model with vertical section planes and read them as a 2D elevation.</p>
        <button type="button" className="sections-primary sections-enable" onClick={() => store.set({ enabled: true })}>
          Start section {sectionTitle(cut.label)}
        </button>
        {!is3d && <p className="sections-note">Cut lines show on the plan. The live clip runs in the 3D view.</p>}
      </div>
    );
  }
  const hover = (id: number | null) => store.update((s) => (s.hoverBuildingId === id ? s : { ...s, hoverBuildingId: id }));
  return (
    <div
      className="sections-tab section-cut-card"
      role="region"
      aria-label="Section cut"
      data-offset={cut.offsetM.toFixed(2)}
      data-angle={cut.angleDeg}
      data-flipped={cut.flipped ? "true" : "false"}
      data-fill={cut.fill}
      data-cuts={set.cuts.length}
      data-active={cut.label}
    >
      <div className="sections-list" role="listbox" aria-label="Section cuts">
        {set.cuts.map((entry) => (
          <div
            key={entry.id}
            role="option"
            aria-selected={entry.id === cut.id}
            tabIndex={0}
            className={entry.id === cut.id ? "sections-chip is-active" : "sections-chip"}
            data-label={entry.label}
            onClick={() => store.update((s) => ({ ...s, activeId: entry.id }))}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") store.update((s) => ({ ...s, activeId: entry.id }));
            }}
          >
            <span className="mono">{sectionTitle(entry.label)}</span>
            <button
              type="button"
              className="sections-chip-remove"
              aria-label={`Remove section ${sectionTitle(entry.label)}`}
              onClick={(event) => {
                event.stopPropagation();
                store.update((s) => removeSectionCut(s, entry.id));
              }}
            >
              <X size={11} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="sections-add"
          aria-label="Add section cut"
          disabled={set.cuts.length >= MAX_SECTION_CUTS}
          onClick={() => store.update(addSectionCut)}
        >
          <Plus size={12} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
      <div className="section-cut-readout mono">
        <span>
          Offset <b className="section-cut-offset">{formatOffset(cut.offsetM)}</b>
        </span>
        <span>
          Bearing <b>{Math.round(cut.angleDeg)}°</b>
        </span>
        <span>
          Looking <b className="section-cut-looking">{looking}</b>
        </span>
      </div>
      <div className="section-cut-actions">
        <button type="button" className="section-cut-btn" aria-label="Rotate cut 15 degrees anticlockwise" onClick={() => store.set({ angleDeg: rotateAngle(cut.angleDeg, 1) })}>
          <RotateCcw size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button type="button" className="section-cut-btn" aria-label="Rotate cut 15 degrees clockwise" onClick={() => store.set({ angleDeg: rotateAngle(cut.angleDeg, -1) })}>
          <RotateCw size={13} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button type="button" className="section-cut-btn section-cut-flip" aria-label={`Flip view direction, now looking ${looking}`} onClick={() => store.set({ flipped: !cut.flipped })}>
          <FlipHorizontal2 size={13} strokeWidth={2.2} aria-hidden="true" />
          <span>Flip</span>
        </button>
        <div className="section-cut-fill" role="group" aria-label="Cut face fill">
          {FILLS.map(([fill, label]) => (
            <button
              key={fill}
              type="button"
              className={cut.fill === fill ? "section-cut-seg is-active" : "section-cut-seg"}
              aria-pressed={cut.fill === fill}
              onClick={() => store.set({ fill })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="sections-row-actions">
        <button
          type="button"
          className={set.drawingOpen ? "sections-primary section-drawing-toggle is-active" : "sections-primary section-drawing-toggle"}
          aria-pressed={set.drawingOpen}
          onClick={() => store.update((s) => ({ ...s, drawingOpen: !s.drawingOpen }))}
        >
          {set.drawingOpen ? "Hide drawing" : "Section drawing"}
        </button>
        <button type="button" className="section-cut-close sections-off" onClick={() => store.set({ enabled: false })}>
          Off
        </button>
      </div>
      <div className="sections-crossed">
        <div className="sections-crossed-head">
          <span>Cut through</span>
          <span className="mono">{profile ? profile.cut.length : 0} bldgs</span>
        </div>
        {profile && profile.cut.length > 0 ? (
          <ul className="sections-bldg-list" aria-label="Buildings crossed by the cut" onMouseLeave={() => hover(null)}>
            {profile.cut.map((b) => (
              <li
                key={b.id}
                className={set.hoverBuildingId === b.id ? "sections-bldg is-hover" : "sections-bldg"}
                data-building-id={b.id}
                onMouseEnter={() => hover(b.id)}
                onFocus={() => hover(b.id)}
                tabIndex={0}
              >
                <span className="sections-bldg-at mono">{Math.round(b.distanceM)} m</span>
                <span className="sections-bldg-main">
                  <b>{b.name ?? titleUse(b.use)}</b>
                  <i className={b.estimated ? "is-est" : undefined} title={b.sourceLabel}>
                    {b.estimated ? "Est. · " : ""}
                    {b.sourceLabel.replace(/^Zone default · |^Estimate · /, "")}
                  </i>
                </span>
                <span className="sections-bldg-h mono">
                  {b.height.toFixed(1)} m
                  <i>
                    {b.storeysEstimated ? "~" : ""}
                    {b.storeys} st
                  </i>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sections-note">No footprints on this line. Drag the plane or rotate it.</p>
        )}
        <p className="sections-note">Distance from {cut.label} along the cut. ~ storeys are height ÷ 3.2 m.</p>
      </div>
    </div>
  );
}
