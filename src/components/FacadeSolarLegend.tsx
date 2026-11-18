import { getColour } from "../lib/colours";

export function FacadeSolarLegend({ compact }: { compact?: boolean }) {
  const items = [
    { key: "--facade-hours-ok", label: "≥ threshold" },
    { key: "--facade-hours-warn", label: "Just below" },
    { key: "--facade-hours-low", label: "Low" },
    { key: "--facade-hours-none", label: "None" },
  ] as const;
  return (
    <div className={compact ? "facade-solar-legend is-compact hud-card" : "facade-solar-legend hud-card"} data-facade-solar-legend>
      <span className="facade-solar-legend-title">Facade hours (21 Jun 9–15)</span>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <span className="facade-solar-swatch" style={{ background: getColour(item.key) }} aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
