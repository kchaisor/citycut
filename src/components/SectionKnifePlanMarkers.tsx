import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { sectionPlanMarkerGeometry } from "../lib/sectionKnife/marker";
import type { SectionKnifeToolState } from "../lib/sectionKnife/state";
import type { CityModel } from "../types";
import { screenPx } from "../lib/lineweights";
import { themeColor } from "../lib/themeColor";

function knifeLetter(label: string): string {
  const match = label.match(/\b([A-Z])\s*$/);
  return match?.[1] ?? "A";
}

export function SectionKnifePlanMarkers({
  model,
  tool,
}: {
  model: CityModel;
  tool: SectionKnifeToolState;
}) {
  const unit = model.sideM * 0.007;
  const ink = getColour("--section-knife-marker-gold");
  const muted = getColour("--section-knife-elevation-grid");
  const markers = useMemo(() => {
    if (!tool.active) return [];
    return tool.knives.map((knife) => ({
      knife,
      geom: sectionPlanMarkerGeometry(model, knife.pose),
      selected: knife.id === tool.selectedId,
    }));
  }, [model, tool]);
  if (markers.length === 0) return null;
  const dash = `${screenPx(14)} ${screenPx(3.2)}`;
  return (
    <g className="section-knife-plan-markers" data-section-knife-plan-markers="1">
      {markers.map(({ knife, geom, selected }) => {
        const stroke = selected ? ink : muted;
        const sw = selected ? screenPx(1.35) : screenPx(1.05);
        const x0 = geom.east0;
        const y0 = -geom.north0;
        const x1 = geom.east1;
        const y1 = -geom.north1;
        const te = geom.tangentEast;
        const tn = -geom.tangentNorth;
        const tick = unit * 12;
        const perpE = -tn;
        const perpN = te;
        const letter = knifeLetter(knife.label);
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const arrow = unit * 32;
        const ax = mx + geom.viewEast * arrow * 0.35;
        const ay = my + -geom.viewNorth * arrow * 0.35;
        const wing = unit * 9;
        const ve = geom.viewEast;
        const vn = -geom.viewNorth;
        return (
          <g key={knife.id} data-section-knife-marker-id={knife.id} opacity={selected ? 1 : 0.72}>
            <path
              d={`M ${x0} ${y0} L ${x1} ${y1}`}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={dash}
              strokeLinecap="square"
              vectorEffect="non-scaling-stroke"
            />
            {[
              [x0, y0],
              [x1, y1],
            ].map(([ex, ey], i) => (
              <path
                key={i}
                d={`M ${ex - perpE * tick} ${ey - perpN * tick} L ${ex + perpE * tick} ${ey + perpN * tick}`}
                fill="none"
                stroke={stroke}
                strokeWidth={sw * 1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d={`M ${ax - ve * wing + -vn * wing * 0.55} ${ay - vn * wing + ve * wing * 0.55} L ${ax} ${ay} L ${ax - ve * wing + vn * wing * 0.55} ${ay - vn * wing + -ve * wing * 0.55}`}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x0} cy={y0} r={unit * 16} fill={themeColor("--bg-elev")} stroke={stroke} strokeWidth={sw * 0.9} vectorEffect="non-scaling-stroke" />
            <circle cx={x1} cy={y1} r={unit * 16} fill={themeColor("--bg-elev")} stroke={stroke} strokeWidth={sw * 0.9} vectorEffect="non-scaling-stroke" />
            <text x={x0} y={y0 + unit * 14} textAnchor="middle" fontSize={screenPx(11)} className="mono" fill={stroke}>
              {letter}
            </text>
            <text x={x1} y={y1 + unit * 14} textAnchor="middle" fontSize={screenPx(11)} className="mono" fill={stroke}>
              {letter}′
            </text>
          </g>
        );
      })}
      {tool.snapCue && tool.snapCue.untilMs > Date.now() ? (
        <circle
          className="section-knife-snap-cue"
          data-section-knife-snap-cue="1"
          cx={tool.snapCue.east}
          cy={-tool.snapCue.north}
          r={unit * 20}
          fill="none"
          stroke={ink}
          strokeWidth={screenPx(1.2)}
          strokeDasharray={`${screenPx(4)} ${screenPx(3)}`}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </g>
  );
}
