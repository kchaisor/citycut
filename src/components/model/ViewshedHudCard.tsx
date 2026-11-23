import type { CSSProperties } from "react";
import { analysisCardCollapsed } from "../../lib/analysisCards";
import { ViewLegend } from "../ViewPanel";
import { WALK_SPEEDS } from "../useWalkViewshed";
import { AnalysisHudCard } from "./AnalysisHudCard";
import {
  VIEWSHED_EYE_MATCH_M,
  VIEWSHED_EYE_PRESETS_M,
  VIEWSHED_RADIUS_PRESETS_M,
  viewshedCardMeta,
  viewshedComputeLabel,
  viewshedHint,
  viewshedReadout,
} from "./viewshedCard";
import type { ModelPageViewModel } from "./useModelPage";

export function ViewshedHudCard({ vm }: { vm: ModelPageViewModel }) {
  const { analysisCardOpen, toggleAnalysisCard, walk, walkAt } = vm;
  const last = Math.max(0, walk.sampleCount - 1);
  const hasPath = walk.sampleCount > 1;
  const walkTrack = {
    "--wind-streaks-fill": `${last > 0 ? (Math.min(walkAt.index, last) / last) * 100 : 0}%`,
  } as CSSProperties;
  return (
    <AnalysisHudCard
      kind="view"
      title="Viewshed Walk"
      label="Viewshed Walk panel"
      className="viewshed-card"
      meta={viewshedCardMeta(walk.eyeM, walk.radiusM)}
      collapsed={analysisCardCollapsed(analysisCardOpen, "view")}
      onToggle={() => toggleAnalysisCard("view")}
    >
      <p className="ac-hint">{viewshedHint(walk)}</p>
      <div className="ac-seg ac-seg-2" role="group" aria-label="Viewshed overlay toggles">
        <button
          type="button"
          className={walk.drawing ? "ac-seg-btn is-on" : "ac-seg-btn"}
          aria-pressed={walk.drawing}
          onClick={() => walk.setDrawing(!walk.drawing)}
        >
          <span className="ac-dot" aria-hidden="true" />
          <span>{walk.drawing ? "Drawing path…" : "Draw path"}</span>
        </button>
        <button
          type="button"
          className={walk.status === "ready" ? "ac-seg-btn is-on" : "ac-seg-btn"}
          disabled={walk.sampleCount < 2 || walk.status === "computing"}
          onClick={() => walk.compute()}
        >
          <span className="ac-dot" aria-hidden="true" />
          <span>{viewshedComputeLabel(walk)}</span>
        </button>
      </div>

      <div className="ac-section">
        <dl className="ac-kv">
          <dt>Eye height</dt>
          <dd>
            <div className="ac-pills" role="group" aria-label="Eye height">
              {VIEWSHED_EYE_PRESETS_M.map((eyeM) => {
                const active = Math.abs(walk.eyeM - eyeM) < VIEWSHED_EYE_MATCH_M;
                return (
                  <button
                    key={eyeM}
                    type="button"
                    className={active ? "ac-seg-btn is-ink" : "ac-seg-btn"}
                    aria-pressed={active}
                    onClick={() => walk.setEyeM(eyeM)}
                  >
                    {eyeM} m
                  </button>
                );
              })}
            </div>
          </dd>
          <dt>Radius</dt>
          <dd>
            <div className="ac-pills" role="group" aria-label="Radius">
              {VIEWSHED_RADIUS_PRESETS_M.map((radiusM) => (
                <button
                  key={radiusM}
                  type="button"
                  className={walk.radiusM === radiusM ? "ac-seg-btn is-ink" : "ac-seg-btn"}
                  aria-pressed={walk.radiusM === radiusM}
                  onClick={() => walk.setRadiusM(radiusM)}
                >
                  {radiusM} m
                </button>
              ))}
            </div>
          </dd>
        </dl>
      </div>

      <div className="ac-section">
        <span className="ac-kicker">Walk</span>
        <div className="ac-walk-row">
          <button
            type="button"
            className="ac-play mono"
            aria-label={walk.playing ? "Pause walk" : "Play walk"}
            disabled={walk.status !== "ready" && walk.status !== "computing"}
            onClick={() => walk.setPlaying(!walk.playing)}
          >
            {walk.playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <div className="ac-seg ac-seg-3" role="group" aria-label="Walk speed">
            {WALK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={walk.speed === speed ? "ac-seg-btn is-ink mono" : "ac-seg-btn mono"}
                aria-label={`${speed}× walk speed`}
                aria-pressed={walk.speed === speed}
                onClick={() => walk.setSpeed(speed)}
              >
                {speed}×
              </button>
            ))}
          </div>
          <button type="button" className="ac-seg-btn" disabled={walk.clickCount === 0} onClick={walk.clear}>
            Clear
          </button>
        </div>
        <div className="ac-walk-row">
          <span className="ac-bound mono">0 m</span>
          <span className="wind-streaks-track" style={walkTrack}>
            <input
              type="range"
              className="wind-streaks-input"
              aria-label="Position along walk"
              min={0}
              max={last}
              step={1}
              disabled={!hasPath}
              value={Math.min(walkAt.index, last)}
              onChange={(event) => {
                walk.setPlaying(false);
                walk.seek(Number(event.target.value));
              }}
            />
          </span>
          <span className="ac-bound mono">{Math.round(walk.lengthM)} m</span>
        </div>
        <span className="ac-badge mono">{viewshedReadout(walk, walkAt.distanceM)}</span>
      </div>

      <div className="ac-section">
        <span className="ac-kicker">Legend</span>
        <ViewLegend />
      </div>
    </AnalysisHudCard>
  );
}
