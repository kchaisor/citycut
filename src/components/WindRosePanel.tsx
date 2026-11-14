import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import type { WindPeriodId } from "../lib/windRose";
import type { SiteWindSelection } from "../lib/windRoseData";
import { analyzeSiteWind } from "../lib/windRoseStats";
import { windRoseArrowLines, windRoseStackedWedges, windRoseStationCaption } from "../lib/windRoseSvg";

const BAND_VARS = ["--wind-band-0", "--wind-band-1", "--wind-band-2", "--wind-band-3", "--wind-band-4"] as const;

export function WindRosePanel({
  selection,
  period,
}: {
  selection: SiteWindSelection;
  period: WindPeriodId;
}) {
  useColourRevision();
  const stroke = getColour("--wind-rose");
  const stats = useMemo(() => analyzeSiteWind(selection, period), [selection, period]);
  const caption = useMemo(() => windRoseStationCaption(selection, period), [selection, period]);
  const regionalNote = "Regional station wind, not site wind.";
  const wedges = useMemo(() => (stats ? windRoseStackedWedges(stats, 50, 52, 8, 46) : []), [stats]);
  const arrows = useMemo(() => (stats ? windRoseArrowLines(stats, 3, 50, 52, 14) : []), [stats]);

  if (!stats) {
    return <p className="field-note">Wind data is not available for this period.</p>;
  }

  return (
    <div className="wind-rose-panel" aria-label={caption}>
      <svg viewBox="0 0 100 100" role="img" aria-hidden="true" className="wind-rose-panel-svg">
        <text x={50} y={10} textAnchor="middle" fontSize={8} fontWeight={600} fill={stroke}>
          N
        </text>
        <circle cx={50} cy={52} r={40} fill="none" stroke={stroke} strokeWidth={0.7} opacity={0.4} />
        {wedges.map((w, index) => (
          <path key={index} d={w.d} fill={w.fill} fillOpacity={w.opacity} />
        ))}
        {arrows.map((a, i) => (
          <line
            key={i}
            x1={a.x1}
            y1={a.y1}
            x2={a.x2}
            y2={a.y2}
            stroke={stroke}
            strokeWidth={1.1}
            strokeLinecap="round"
          />
        ))}
        <text x={50} y={54} textAnchor="middle" fontSize={11} fontWeight={700} fill={stroke}>
          {stats.calmPercent.toFixed(0)}%
        </text>
        <text x={50} y={61} textAnchor="middle" fontSize={5.5} fill={stroke}>
          calm
        </text>
      </svg>
      <ul className="wind-rose-legend" aria-label="Wind speed bins">
        {BAND_VARS.map((token, band) => (
          <li key={token}>
            <i className="wind-band-swatch" style={{ background: getColour(token) }} aria-hidden="true" />
            <span>
              {band === 0
                ? "0.5–10 km/h"
                : band === 1
                  ? "10–20 km/h"
                  : band === 2
                    ? "20–30 km/h"
                    : band === 3
                      ? "30–40 km/h"
                      : "40+ km/h"}
            </span>
          </li>
        ))}
      </ul>
      <p className="wind-rose-meta">{caption}</p>
      <p className="wind-rose-meta wind-rose-meta-note">{regionalNote}</p>
    </div>
  );
}