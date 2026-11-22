import { axoPaintVar, type AxoDockLegend } from "../lib/explodedAxo";

export function TransportLegendDock({ legend }: { legend: AxoDockLegend }) {
  return (
    <aside className="transport-legend-dock hud-card" data-transport-legend aria-label={`${legend.title} legend`}>
      <div className="transport-legend-title">{legend.title}</div>
      {legend.unavailable ? (
        <div className="transport-legend-status" data-transport-legend-status="unavailable">
          Unavailable
        </div>
      ) : (
        <ul className="transport-legend-rows">
          {legend.swatches.map((swatch) => (
            <li key={swatch.label} className="transport-legend-row" data-transport-mode={swatch.label.toLowerCase()}>
              <span className="transport-legend-swatch" style={{ background: axoPaintVar(swatch.paint) }} aria-hidden="true" />
              <span className="transport-legend-label">{swatch.label}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
