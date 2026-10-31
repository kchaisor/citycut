import { useMemo } from "react";
import { getColour } from "../lib/colours";
import { buildSectionElevation } from "../lib/sectionKnife/elevation";
import { selectedKnife, type SectionKnifeToolState } from "../lib/sectionKnife/state";
import type { CityModel } from "../types";

export function SectionKnifeElevationPanel({ model, tool }: { model: CityModel; tool: SectionKnifeToolState }) {
  const knife = selectedKnife(tool);
  const sliceHalf = model.sideM * 0.55;
  const elevation = useMemo(
    () => buildSectionElevation(model, knife.pose, sliceHalf),
    [model, knife.pose.angleRad, knife.pose.offsetM, sliceHalf],
  );

  const padX = 12;
  const padY = 10;
  const viewW = 280;
  const viewH = 120;
  const spanX = elevation.widthM || 1;
  const spanY = Math.max(8, elevation.maxYM - elevation.minYM);

  const xScale = (x: number) => padX + ((x + sliceHalf) / spanX) * (viewW - padX * 2);
  const yScale = (y: number) => viewH - padY - ((y - elevation.minYM) / spanY) * (viewH - padY * 2);

  const groundPath = elevation.groundProfile
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.x).toFixed(2)} ${yScale(p.y).toFixed(2)}`)
    .join(" ");

  const ink = getColour("--outline-building");
  const cut = getColour("--section-knife-cut-edge");
  const fill = getColour("--section-knife-elevation-fill");

  return (
    <div className="section-knife-elevation hud-card" aria-label="Street section">
      <div className="section-knife-elevation-head">
        <strong>Section</strong>
        <span className="mono">{knife.label}</span>
      </div>
      <svg width={viewW} height={viewH} viewBox={`0 0 ${viewW} ${viewH}`} role="img" aria-label="Live street section">
        <path d={`${groundPath} L ${viewW - padX} ${viewH - padY} L ${padX} ${viewH - padY} Z`} fill={fill} opacity={0.35} />
        <path d={groundPath} fill="none" stroke={ink} strokeWidth={1.2} />
        {elevation.segments.map((seg, index) => {
          const x0 = xScale(seg.x0);
          const x1 = xScale(seg.x1);
          const y0 = yScale(seg.y0);
          const y1 = yScale(seg.y1);
          return (
            <rect
              key={index}
              x={Math.min(x0, x1)}
              y={Math.min(y0, y1)}
              width={Math.abs(x1 - x0)}
              height={Math.abs(y1 - y0)}
              fill="none"
              stroke={ink}
              strokeWidth={1}
            />
          );
        })}
        <line x1={padX} y1={padY} x2={padX} y2={viewH - padY} stroke={cut} strokeWidth={1.5} />
      </svg>
    </div>
  );
}
