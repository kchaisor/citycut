import { useId, useMemo } from "react";
import { getColour } from "../lib/colours";
import { buildSectionElevation, sectionElevationRlTicks } from "../lib/sectionKnife/elevation";
import { selectedKnife, type SectionKnifeToolState } from "../lib/sectionKnife/state";
import type { CityModel } from "../types";

export function SectionKnifeElevationPanel({ model, tool }: { model: CityModel; tool: SectionKnifeToolState }) {
  const knife = selectedKnife(tool);
  const hatchId = useId().replace(/:/g, "");
  const elevation = useMemo(
    () => buildSectionElevation(model, knife.pose),
    [model, knife.pose.angleRad, knife.pose.offsetM],
  );

  const padPlotX = 48;
  const padRight = 12;
  const padTop = 20;
  const padBottom = 30;
  const viewW = 356;
  const viewH = 188;
  const plotW = viewW - padPlotX - padRight;
  const plotH = viewH - padTop - padBottom;
  const spanX = elevation.halfWidthM * 2;
  const spanY = Math.max(12, elevation.maxYM - elevation.minYM);
  const plotBottom = viewH - padBottom;

  const xScale = (tangent: number) => padPlotX + ((tangent + elevation.halfWidthM) / spanX) * plotW;
  const yScale = (y: number) => padTop + (1 - (y - elevation.minYM) / spanY) * plotH;

  const rlTicks = useMemo(
    () => sectionElevationRlTicks(elevation.minYM, elevation.maxYM, yScale),
    [elevation.minYM, elevation.maxYM, spanY, plotH],
  );

  const groundPoche = getColour("--section-knife-elevation-ground");
  const beyondFill = getColour("--section-knife-elevation-beyond");
  const cutFill = getColour("--section-knife-poche");
  const terrainInk = getColour("--outline-building");
  const grid = getColour("--section-knife-elevation-grid");
  const sky = getColour("--section-knife-elevation-sky");
  const markerGold = getColour("--section-knife-marker-gold");
  const floorLine = getColour("--section-knife-floor-line");

  const groundLinePath = elevation.ground
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.tangent).toFixed(2)} ${yScale(p.y).toFixed(2)}`)
    .join(" ");

  const groundFillPath = useMemo(() => {
    if (elevation.ground.length < 2) return "";
    const pts = elevation.ground
      .map((p) => `${xScale(p.tangent).toFixed(2)} ${yScale(p.y).toFixed(2)}`)
      .join(" L ");
    const first = elevation.ground[0]!;
    const last = elevation.ground[elevation.ground.length - 1]!;
    return `M ${xScale(first.tangent).toFixed(2)} ${plotBottom} L ${pts} L ${xScale(last.tangent).toFixed(2)} ${plotBottom} Z`;
  }, [elevation.ground, plotBottom, spanX, spanY, elevation.minYM]);

  const metersPerPxX = spanX / plotW;
  const metersPerPxY = spanY / plotH;
  const verticalExaggeration = metersPerPxX / metersPerPxY;

  const distTicks = [250, 500, 750].filter((d) => d < spanX - 40);

  const beyondCount = elevation.profiles.filter((p) => !p.cutByKnife).length;

  return (
    <div
      className="section-knife-elevation hud-card"
      aria-label="Street section"
      data-section-knife-beyond-count={beyondCount}
    >
      <div className="section-knife-elevation-head">
        <strong>Section</strong>
        <span className="mono section-knife-elevation-knife-id">{knife.label}</span>
      </div>
      <svg
        className="section-knife-elevation-chart"
        width={viewW}
        height={viewH}
        viewBox={`0 0 ${viewW} ${viewH}`}
        role="img"
        aria-label="Live street section"
        shapeRendering="crispEdges"
      >
        <defs>
          <pattern id={hatchId} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke={groundPoche} strokeWidth="1.2" opacity="0.35" />
          </pattern>
        </defs>
        <rect x={padPlotX} y={padTop} width={plotW} height={plotH} fill={sky} />
        {rlTicks.map((y) => (
          <g key={y}>
            <line
              x1={padPlotX}
              y1={yScale(y)}
              x2={viewW - padRight}
              y2={yScale(y)}
              stroke={grid}
              strokeOpacity={0.07}
              strokeWidth={1}
            />
            <text className="section-knife-rl mono" x={padPlotX - 6} y={yScale(y) + 3} textAnchor="end" fontSize={9} fill={grid} opacity={0.62}>
              RL {Math.round(y)}
            </text>
          </g>
        ))}
        {groundFillPath ? (
          <>
            <path d={groundFillPath} fill={groundPoche} />
            <path d={groundFillPath} fill={`url(#${hatchId})`} opacity={0.55} />
          </>
        ) : null}
        {elevation.profiles.map((profile) => {
          const x0 = xScale(profile.tangentMin);
          const x1 = xScale(profile.tangentMax);
          const yBase = yScale(profile.baseY);
          const yTop = yScale(profile.topY);
          const w = Math.max(1, x1 - x0);
          const h = Math.max(1, yBase - yTop);
          const fill = profile.cutByKnife ? cutFill : beyondFill;
          return (
            <g key={profile.id}>
              <rect
                x={x0}
                y={yTop}
                width={w}
                height={h}
                fill={fill}
                stroke={profile.cutByKnife ? "none" : grid}
                strokeOpacity={profile.cutByKnife ? 0 : 0.22}
                strokeWidth={profile.cutByKnife ? 0 : 0.6}
              />
              {profile.cutByKnife
                ? profile.floors.map((floor, index) => (
                    <line
                      key={index}
                      x1={x0 + 1}
                      x2={x1 - 1}
                      y1={yScale(floor.yM)}
                      y2={yScale(floor.yM)}
                      stroke={floorLine}
                      strokeWidth={floor.estimated ? 0.55 : 0.85}
                      strokeDasharray={floor.estimated ? "2 2" : undefined}
                      opacity={floor.estimated ? 0.6 : 0.92}
                    />
                  ))
                : null}
            </g>
          );
        })}
        <path d={groundLinePath} fill="none" stroke={terrainInk} strokeWidth={1.35} />
        <line x1={xScale(0)} y1={padTop} x2={xScale(0)} y2={plotBottom} stroke={markerGold} strokeWidth={1.8} />
        <circle cx={xScale(0)} cy={padTop + 3.5} r={2.6} fill={markerGold} />
        <text className="mono section-knife-end-label" x={xScale(-elevation.halfWidthM)} y={plotBottom - 6} textAnchor="start" fontSize={10} fill={grid} opacity={0.88}>
          A
        </text>
        <text className="mono section-knife-end-label" x={xScale(elevation.halfWidthM)} y={plotBottom - 6} textAnchor="end" fontSize={10} fill={grid} opacity={0.88}>
          A&prime;
        </text>
        {distTicks.map((d) => {
          const t = d - elevation.halfWidthM;
          const x = xScale(t);
          return (
            <g key={d}>
              <line x1={x} y1={plotBottom} x2={x} y2={plotBottom + 4} stroke={grid} strokeWidth={1} opacity={0.45} />
              <text className="mono" x={x} y={viewH - 6} textAnchor="middle" fontSize={9} fill={grid} opacity={0.72}>
                {d}
              </text>
            </g>
          );
        })}
        <text className="mono" x={viewW - padRight} y={padTop + 9} textAnchor="end" fontSize={8} fill={grid} opacity={0.55}>
          {Math.round(spanX)} m
        </text>
        {verticalExaggeration > 1.08 ? (
          <text className="mono" x={padPlotX} y={padTop + 9} fontSize={8} fill={grid} opacity={0.55}>
            Vert. ex. ×{verticalExaggeration.toFixed(1)}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
