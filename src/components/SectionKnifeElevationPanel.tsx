import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { buildSectionElevation } from "../lib/sectionKnife/elevation";
import { selectedKnife, type SectionKnifeToolState } from "../lib/sectionKnife/state";
import type { CityModel } from "../types";

export function SectionKnifeElevationPanel({ model, tool }: { model: CityModel; tool: SectionKnifeToolState }) {
  const knife = selectedKnife(tool);
  const elevation = useMemo(
    () => buildSectionElevation(model, knife.pose),
    [model, knife.pose.angleRad, knife.pose.offsetM],
  );

  const padX = 28;
  const padY = 22;
  const viewW = 360;
  const viewH = 168;
  const spanX = elevation.halfWidthM * 2;
  const spanY = Math.max(12, elevation.maxYM - elevation.minYM);

  const xScale = (tangent: number) => padX + ((tangent + elevation.halfWidthM) / spanX) * (viewW - padX * 2);
  const yScale = (y: number) => viewH - padY - ((y - elevation.minYM) / spanY) * (viewH - padY * 2);

  const groundPath = elevation.ground
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.tangent).toFixed(2)} ${yScale(p.y).toFixed(2)}`)
    .join(" ");

  const poche = getColour("--section-knife-poche");
  const ink = getColour("--outline-building");
  const cut = getColour("--section-knife-cut-edge");
  const floorLine = getColour("--section-knife-floor-line");
  const sky = getColour("--section-knife-elevation-sky");

  const scaleStepM = spanY > 40 ? 10 : 5;
  const scaleTicks: number[] = [];
  const y0 = Math.ceil(elevation.minYM / scaleStepM) * scaleStepM;
  for (let y = y0; y <= elevation.maxYM; y += scaleStepM) scaleTicks.push(y);

  return (
    <div className="section-knife-elevation hud-card" aria-label="Street section">
      <div className="section-knife-elevation-head">
        <strong>Section</strong>
        <span className="mono">{knife.label}</span>
      </div>
      <svg width={viewW} height={viewH} viewBox={`0 0 ${viewW} ${viewH}`} role="img" aria-label="Live street section">
        <rect x={padX} y={padY} width={viewW - padX * 2} height={viewH - padY * 2} fill={sky} />
        {scaleTicks.map((y) => (
          <g key={y}>
            <line
              x1={padX}
              y1={yScale(y)}
              x2={viewW - padX}
              y2={yScale(y)}
              stroke={ink}
              strokeOpacity={0.08}
              strokeWidth={1}
            />
            <text x={4} y={yScale(y) + 3} fontSize={9} fill={ink} opacity={0.55}>
              {y}m
            </text>
          </g>
        ))}
        <path d={groundPath} fill="none" stroke={ink} strokeWidth={1.4} />
        {elevation.profiles.map((profile) => {
          const x0 = xScale(profile.tangentMin);
          const x1 = xScale(profile.tangentMax);
          const yBase = yScale(profile.baseY);
          const yTop = yScale(profile.topY);
          const w = Math.max(1, x1 - x0);
          const h = Math.max(1, yBase - yTop);
          return (
            <g key={profile.id}>
              <rect x={x0} y={yTop} width={w} height={h} fill={poche} stroke={cut} strokeWidth={1.2} />
              {profile.floors.map((floor, index) => (
                <line
                  key={index}
                  x1={x0 + 1}
                  x2={x1 - 1}
                  y1={yScale(floor.yM)}
                  y2={yScale(floor.yM)}
                  stroke={floorLine}
                  strokeWidth={floor.estimated ? 0.6 : 0.9}
                  strokeDasharray={floor.estimated ? "2 2" : undefined}
                  opacity={floor.estimated ? 0.65 : 1}
                />
              ))}
            </g>
          );
        })}
        <line x1={xScale(0)} y1={padY} x2={xScale(0)} y2={viewH - padY} stroke={cut} strokeWidth={2} />
        <text x={viewW - padX - 36} y={viewH - 6} fontSize={9} fill={ink} opacity={0.7}>
          {Math.round(spanX)} m
        </text>
      </svg>
    </div>
  );
}
