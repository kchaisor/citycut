import type { ReactNode } from "react";
import type { SemanticHudSample } from "../lib/semanticHudSample";

function formatArea(m2: number): string {
  if (m2 >= 10_000) return `${(m2 / 1000).toFixed(1)}k m²`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

export function SiteIntelligenceSemantic({
  active,
  sample,
  overview,
}: {
  active: boolean;
  sample: SemanticHudSample;
  overview: ReactNode;
}) {
  if (!active) return <>{overview}</>;

  return (
    <div className="semantic-hud-stack" data-semantic-mode={sample.mode}>
      <div
        className={
          sample.mode === "overview" ? "semantic-hud-pane is-visible" : "semantic-hud-pane"
        }
        aria-hidden={sample.mode !== "overview"}
      >
        {overview}
      </div>
      <div
        className={sample.mode === "building" ? "semantic-hud-pane is-visible" : "semantic-hud-pane"}
        aria-hidden={sample.mode !== "building"}
      >
        {sample.building ? (
          <section className="semantic-hud-building mono" aria-label="Focused building">
            <div className="semantic-hud-head">
              <h3 className="semantic-hud-title">Building</h3>
              <span className="semantic-hud-meta">{sample.building.useLabel}</span>
            </div>
            <div className="kpi-grid semantic-kpi-grid">
              <div className="kpi-cell">
                <div className="kpi-lbl k-lbl">Height</div>
                <div className="kpi-num k-val">{sample.building.heightM.toFixed(1)} m</div>
              </div>
              <div className="kpi-cell">
                <div className="kpi-lbl k-lbl">Floors</div>
                <div className="kpi-num k-val">
                  {sample.building.floors}
                  {sample.building.floorsEstimated ? " est." : ""}
                </div>
              </div>
              <div className="kpi-cell">
                <div className="kpi-lbl k-lbl">Footprint</div>
                <div className="kpi-num k-val">{formatArea(sample.building.footprintM2)}</div>
              </div>
              <div className="kpi-cell">
                <div className="kpi-lbl k-lbl">GFA</div>
                <div className="kpi-num k-val">{formatArea(sample.building.gfaM2)} est.</div>
              </div>
            </div>
            <p className="semantic-hud-source">{sample.building.heightSource}</p>
          </section>
        ) : null}
      </div>
      <div
        className={sample.mode === "walk" ? "semantic-hud-pane is-visible" : "semantic-hud-pane"}
        aria-hidden={sample.mode !== "walk"}
      >
        {sample.walk ? (
          <section className="semantic-hud-walk mono" aria-label="Street view readout">
            <div className="semantic-hud-head">
              <h3 className="semantic-hud-title">Street</h3>
              <span className="semantic-hud-meta">{sample.eyeHeightM.toFixed(1)} m eye</span>
            </div>
            <div className="kpi-grid semantic-kpi-grid">
              <div className="kpi-cell semantic-kpi-wide">
                <div className="kpi-lbl k-lbl">Name</div>
                <div className="kpi-num k-val">{sample.walk.streetName ?? "—"}</div>
              </div>
              <div className="kpi-cell">
                <div className="kpi-lbl k-lbl">Width</div>
                <div className="kpi-num k-val">
                  {sample.walk.roadWidthM != null ? `${sample.walk.roadWidthM.toFixed(1)} m` : "—"}
                </div>
              </div>
              <div className="kpi-cell">
                <div className="kpi-lbl k-lbl">Left bldg</div>
                <div className="kpi-num k-val">
                  {sample.walk.leftHeightM != null ? `${sample.walk.leftHeightM.toFixed(0)} m` : "—"}
                </div>
              </div>
              <div className="kpi-cell">
                <div className="kpi-lbl k-lbl">Right bldg</div>
                <div className="kpi-num k-val">
                  {sample.walk.rightHeightM != null ? `${sample.walk.rightHeightM.toFixed(0)} m` : "—"}
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
