import { useState, type KeyboardEvent } from "react";
import { getColour } from "../lib/colours";
import { useColourRevision } from "../lib/useColourRevision";
import { sectorCenterDeg, sectorLabel, WIND_SECTOR_COUNT, type WindPeriodStats } from "../lib/windRose";
import {
  annularSectorPath,
  DEFAULT_WIND_ROSE_LAYOUT,
  WIND_ROSE_FREQUENCY_GUIDES,
  windRoseCardinalPositions,
  windRoseGuideLabelPositions,
  windRosePetalOuterRadii,
  windRoseSectorPoint,
  windRoseStackedWedges,
  type WindRoseChartLayout,
} from "../lib/windRoseChart";

export type WindRosePicker = {
  selected: number | null;
  onSelect: (sector: number) => void;
  onStep: (delta: number) => void;
  tip: (sector: number) => string;
};

const VIEW_SIZE = 240;
const SELECTED_ARC_PX = 4;
const CARDINALS = [
  { key: "n", label: "N", sector: 0, colour: "--wind-rose-n-label" },
  { key: "e", label: "E", sector: 4, colour: "--wind-rose-h-label" },
  { key: "s", label: "S", sector: 8, colour: "--wind-rose-h-label" },
  { key: "w", label: "W", sector: 12, colour: "--wind-rose-h-label" },
] as const;

const SECTORS = Array.from({ length: WIND_SECTOR_COUNT }, (_, sector) => sector);

export function WindRoseSvgChart({
  stats,
  hubFill,
  className,
  picker,
}: {
  stats: WindPeriodStats;
  hubFill: string;
  className?: string;
  picker?: WindRosePicker;
}) {
  useColourRevision();
  const [hovered, setHovered] = useState<number | null>(null);
  const layout = DEFAULT_WIND_ROSE_LAYOUT;
  const wedges = windRoseStackedWedges(stats, layout);
  const cardinals = windRoseCardinalPositions(layout);
  const guides = windRoseGuideLabelPositions(layout);
  const ringStroke = getColour("--wind-rose-ring");
  const guideStroke = getColour("--wind-rose-guide");
  const selected = picker?.selected ?? null;
  const active = picker ? hovered : null;

  const rings = (
    <>
      <circle cx={layout.cx} cy={layout.cy} r={layout.outerR} fill="none" stroke={ringStroke} strokeWidth={1} />
      {WIND_ROSE_FREQUENCY_GUIDES.map((frac) => (
        <circle
          key={frac}
          cx={layout.cx}
          cy={layout.cy}
          r={layout.petalMaxR * frac}
          fill="none"
          stroke={guideStroke}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      ))}
    </>
  );

  const labels = (
    <>
      <circle cx={layout.cx} cy={layout.cy} r={layout.hubR} fill={hubFill} />
      {guides.map((g) => (
        <text key={g.pct} x={g.x + 6} y={g.y - 4} fontSize={10} fill={guideStroke} fontFamily="var(--mono)">
          {g.pct}%
        </text>
      ))}
      {CARDINALS.map((c) => (
        <text
          key={c.key}
          x={cardinals[c.key].x}
          y={cardinals[c.key].y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={selected === c.sector ? 800 : 600}
          fill={getColour(c.colour)}
          className={selected === c.sector ? "wind-rose-label is-selected" : undefined}
        >
          {c.label}
        </text>
      ))}
    </>
  );

  if (!picker) {
    return (
      <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} role="img" aria-hidden="true" className={className}>
        {rings}
        {wedges.map((w, index) => (
          <path key={index} d={w.d} fill={w.fill} fillOpacity={0.95} />
        ))}
        {labels}
      </svg>
    );
  }

  const outerRadii = windRosePetalOuterRadii(stats, layout);
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      picker.onStep(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = active ?? selected;
      if (target != null) picker.onSelect(target);
    }
  };
  const valueText = selected != null ? `${sectorLabel(selected)} · ${sectorCenterDeg(selected)}°` : undefined;

  return (
    <div className="wind-rose-picker" data-hovering={active != null ? "true" : undefined}>
      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        tabIndex={0}
        role="slider"
        aria-label="Wind direction. Click a sector or use the left and right arrow keys."
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={360 - 360 / WIND_SECTOR_COUNT}
        aria-valuenow={selected != null ? sectorCenterDeg(selected) : undefined}
        aria-valuetext={valueText}
        className={className ? `${className} wind-rose-picker-svg` : "wind-rose-picker-svg"}
        onKeyDown={onKeyDown}
        onPointerLeave={() => setHovered(null)}
        onBlur={() => setHovered(null)}
      >
        {rings}
        {SECTORS.map((sector) => (
          <g
            key={sector}
            className={petalClass(sector, active, selected)}
            data-sector={sector}
          >
            {wedges
              .filter((w) => w.sector === sector)
              .map((w, index) => (
                <path key={index} d={w.d} fill={w.fill} className="wind-rose-petal-band" />
              ))}
            {outerRadii[sector]! > 0 ? (
              <path
                className="wind-rose-petal-outline"
                d={annularSectorPath(layout.cx, layout.cy, layout.hubR, outerRadii[sector]!, sectorCenterDeg(sector))}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </g>
        ))}
        {labels}
        {selected != null ? <SelectedSector layout={layout} sector={selected} /> : null}
        {SECTORS.map((sector) => (
          <path
            key={sector}
            className="wind-rose-hit"
            data-sector={sector}
            d={annularSectorPath(layout.cx, layout.cy, 0, layout.outerR + SELECTED_ARC_PX / 2, sectorCenterDeg(sector))}
            onPointerEnter={() => setHovered(sector)}
            onClick={() => picker.onSelect(sector)}
          />
        ))}
      </svg>
      {active != null ? <WindRoseTip layout={layout} sector={active} text={picker.tip(active)} /> : null}
    </div>
  );
}

function petalClass(sector: number, hovered: number | null, selected: number | null): string {
  let name = "wind-rose-petal";
  if (sector === hovered) name += " is-hovered";
  if (sector === selected) name += " is-selected";
  return name;
}

function SelectedSector({ layout, sector }: { layout: WindRoseChartLayout; sector: number }) {
  const label = sectorLabel(sector);
  const isCardinal = CARDINALS.some((c) => c.sector === sector);
  const at = windRoseSectorPoint(layout, sector, layout.labelR);
  return (
    <>
      <path
        className="wind-rose-selected-arc"
        d={annularSectorPath(
          layout.cx,
          layout.cy,
          layout.outerR - SELECTED_ARC_PX / 2,
          layout.outerR + SELECTED_ARC_PX / 2,
          sectorCenterDeg(sector),
        )}
        vectorEffect="non-scaling-stroke"
      />
      {isCardinal ? null : (
        <text
          x={at.x}
          y={at.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={800}
          fill={getColour("--wind-rose-n-label")}
          className="wind-rose-label is-selected"
        >
          {label}
        </text>
      )}
    </>
  );
}

function WindRoseTip({ layout, sector, text }: { layout: WindRoseChartLayout; sector: number; text: string }) {
  const at = windRoseSectorPoint(layout, sector, layout.outerR);
  const xPct = (at.x / VIEW_SIZE) * 100;
  const yPct = (at.y / VIEW_SIZE) * 100;
  return (
    <span
      className={at.y < layout.cy ? "wind-rose-tip is-above" : "wind-rose-tip is-below"}
      role="tooltip"
      style={{ left: `${xPct}%`, top: `${yPct}%`, ["--wind-rose-tip-shift" as string]: `-${xPct}%` }}
    >
      {text}
    </span>
  );
}
