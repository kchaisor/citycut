import { useState } from "react";
import {
  ARROW_ANIMATIONS,
  ARROW_ANIMATION_LABELS,
  ARROW_COLOURS,
  ARROW_COLOUR_LABELS,
  ARROW_COLOUR_TOKENS,
  ARROW_STYLES,
  ARROW_STYLE_LABELS,
  ARROW_WIDTHS,
  ARROW_WIDTH_LABELS,
  MAX_ARROW_HEIGHT_M,
  MAX_ARROW_LABEL_LENGTH,
  type DiagramArrow,
} from "../../lib/diagramArrows";
import { selectedArrow, type ArrowToolAction, type ArrowToolState } from "../../lib/diagramArrowsTool";
import { ArrowStyleSwatch } from "../DiagramArrowsDrawing";
import { AnalysisHudCard } from "./AnalysisHudCard";

export type ArrowsCardModel = { state: ArrowToolState; dispatch: (action: ArrowToolAction) => void };

export function ArrowsHudCard({ arrows }: { arrows: ArrowsCardModel }) {
  const { state, dispatch } = arrows;
  const [collapsed, setCollapsed] = useState(false);
  const selected = selectedArrow(state);
  const current: Pick<DiagramArrow, "style" | "colour" | "width" | "heightM" | "label" | "animation" | "showIn3d" | "showInDrawing"> =
    selected ?? state.defaults;
  const patch = (value: Partial<typeof current>) => dispatch({ type: "patch", patch: value });
  const hint = state.draft
    ? `${state.draft.length} point${state.draft.length === 1 ? "" : "s"}: Enter or double-click to finish, Esc to cancel`
    : selected
      ? "Drag points to move. Delete removes the arrow."
      : "Click the ground to start an arrow";

  return (
    <AnalysisHudCard
      kind="exploded-axo"
      title="Arrows"
      label="Arrows panel"
      className="arrows-card"
      meta={`${state.arrows.length} arrow${state.arrows.length === 1 ? "" : "s"}`}
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
    >
      <div className="ac-section">
        <span className="ac-kicker">Style</span>
        <div className="arrow-style-grid" role="group" aria-label="Arrow style">
          {ARROW_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              className={current.style === style ? "arrow-style-btn is-on" : "arrow-style-btn"}
              aria-pressed={current.style === style}
              onClick={() => patch({ style })}
            >
              <ArrowStyleSwatch style={style} colour={current.colour} />
              <span>{ARROW_STYLE_LABELS[style]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="ac-section">
        <span className="ac-kicker">Colour</span>
        <div className="arrow-colour-row" role="group" aria-label="Arrow colour">
          {ARROW_COLOURS.map((colour) => (
            <button
              key={colour}
              type="button"
              className={current.colour === colour ? "arrow-colour-btn is-on" : "arrow-colour-btn"}
              aria-label={ARROW_COLOUR_LABELS[colour]}
              aria-pressed={current.colour === colour}
              style={{ background: `var(${ARROW_COLOUR_TOKENS[colour]})` }}
              onClick={() => patch({ colour })}
            />
          ))}
        </div>
      </div>
      <div className="ac-section">
        <span className="ac-kicker">Width</span>
        <div className="ac-seg ac-seg-3" role="group" aria-label="Arrow width">
          {ARROW_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              className={current.width === width ? "ac-seg-btn is-ink" : "ac-seg-btn"}
              aria-pressed={current.width === width}
              onClick={() => patch({ width })}
            >
              {ARROW_WIDTH_LABELS[width]}
            </button>
          ))}
        </div>
      </div>
      <div className="ac-section">
        <label className="ac-kicker" htmlFor="arrow-height">
          Height (m)
        </label>
        <input
          id="arrow-height"
          className="arrow-field"
          type="number"
          min={0}
          max={MAX_ARROW_HEIGHT_M}
          step={1}
          value={current.heightM}
          onChange={(event) => patch({ heightM: Number(event.target.value) })}
        />
      </div>
      <div className="ac-section">
        <label className="ac-kicker" htmlFor="arrow-label">
          Label
        </label>
        <input
          id="arrow-label"
          className="arrow-field"
          type="text"
          maxLength={MAX_ARROW_LABEL_LENGTH}
          value={current.label}
          onChange={(event) => patch({ label: event.target.value })}
        />
      </div>
      <div className="ac-section">
        <label className="ac-kicker" htmlFor="arrow-animation">
          Animation
        </label>
        <select
          id="arrow-animation"
          className="arrow-field"
          value={current.animation}
          onChange={(event) => patch({ animation: event.target.value as DiagramArrow["animation"] })}
        >
          {ARROW_ANIMATIONS.map((animation) => (
            <option key={animation} value={animation}>
              {ARROW_ANIMATION_LABELS[animation]}
            </option>
          ))}
        </select>
        <p className="ac-note">Animation preview comes next</p>
      </div>
      <div className="ac-section">
        <label className="arrow-check">
          <input type="checkbox" checked={current.showIn3d} onChange={(event) => patch({ showIn3d: event.target.checked })} />
          <span>Show in 3D</span>
        </label>
        <label className="arrow-check">
          <input
            type="checkbox"
            checked={current.showInDrawing}
            onChange={(event) => patch({ showInDrawing: event.target.checked })}
          />
          <span>Show in Drawing</span>
        </label>
      </div>
      <div className="ac-section">
        <span className="ac-kicker">Arrows</span>
        <ul className="arrow-list">
          {state.arrows.map((arrow, index) => (
            <li key={arrow.id} className={arrow.id === state.selectedId ? "is-on" : undefined}>
              <button
                type="button"
                className="arrow-list-select"
                aria-pressed={arrow.id === state.selectedId}
                onClick={() => dispatch({ type: "select", id: arrow.id })}
              >
                {arrow.label || `Arrow ${index + 1}`}
              </button>
              <button
                type="button"
                className="arrow-list-delete"
                aria-label={`Delete ${arrow.label || `Arrow ${index + 1}`}`}
                onClick={() => dispatch({ type: "deleteArrow", id: arrow.id })}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
      <p className="ac-note">{hint}</p>
      <div className="ac-seg ac-seg-2" role="group" aria-label="Arrow actions">
        <button type="button" className="ac-seg-btn" onClick={() => dispatch({ type: "beginDraft" })}>
          New arrow
        </button>
        <button type="button" className="ac-seg-btn is-ink" onClick={() => dispatch({ type: "setActive", active: false })}>
          Done
        </button>
      </div>
    </AnalysisHudCard>
  );
}
