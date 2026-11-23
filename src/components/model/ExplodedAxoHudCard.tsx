import { useState, type CSSProperties } from "react";
import { explodeGapShare, type ExplodeGapRange } from "../../lib/modelExplode";
import { AnalysisHudCard } from "./AnalysisHudCard";

export type ExplodedAxoCardModel = {
  explodeGap: { range: ExplodeGapRange; gapM: number };
  setExplodeGapM: (gapM: number) => void;
};

export function ExplodedAxoHudCard({ vm }: { vm: ExplodedAxoCardModel }) {
  const { explodeGap, setExplodeGapM } = vm;
  const { range, gapM } = explodeGap;
  const [collapsed, setCollapsed] = useState(false);
  const gapTrack = {
    "--wind-streaks-fill": `${explodeGapShare(range, gapM) * 100}%`,
    "--wind-streaks-tick": explodeGapShare(range, range.defaultM),
  } as CSSProperties;
  return (
    <AnalysisHudCard
      kind="exploded-axo"
      title="Exploded axo"
      label="Exploded axo panel"
      className="exploded-axo-card"
      meta={`${gapM} m gap`}
      collapsed={collapsed}
      onToggle={() => setCollapsed(!collapsed)}
    >
      <div className="ac-section" role="group" aria-label="Layer gap">
        <div className="ac-slider-head">
          <span className="ac-kicker">Layer gap</span>
          <output className="ac-value mono" aria-live="polite">
            {gapM} m
          </output>
        </div>
        <div className="ac-slider-row">
          <span aria-hidden="true">{range.minM} m</span>
          <span className="wind-streaks-track" style={gapTrack}>
            <span className="wind-streaks-tick" aria-hidden="true" />
            <input
              className="wind-streaks-input"
              type="range"
              aria-label="Layer gap"
              aria-valuetext={`${gapM} m`}
              min={range.minM}
              max={range.maxM}
              step={range.stepM}
              value={gapM}
              onChange={(event) => setExplodeGapM(Number(event.target.value))}
            />
          </span>
          <span aria-hidden="true">{range.maxM} m</span>
        </div>
      </div>
    </AnalysisHudCard>
  );
}
