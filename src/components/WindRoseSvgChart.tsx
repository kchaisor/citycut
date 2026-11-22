import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { getColour } from "../lib/colours";
import { formatCalmPercent } from "../lib/windBins";
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
  windRoseSelectedArcPaths,
  windRoseStackedWedges,
  windRoseTipBox,
  WIND_ROSE_SELECTED_LABEL_GAP_PX,
  type WindRoseChartLayout,
} from "../lib/windRoseChart";

export type WindRosePicker = {
  selected: number | null;
  onSelect: (sector: number) => void;
  onStep: (delta: number) => void;
  tip: (sector: number) => string;
};

const VIEW_SIZE = 240;
const CARDINAL_LABEL_PX = 11;
const VIEW_TOP = DEFAULT_WIND_ROSE_LAYOUT.cy - DEFAULT_WIND_ROSE_LAYOUT.labelR - CARDINAL_LABEL_PX / 2;
const VIEW_HEIGHT = VIEW_SIZE - VIEW_TOP;
const VIEW_BOX = `0 ${VIEW_TOP} ${VIEW_SIZE} ${VIEW_HEIGHT}`;
const CHART_STYLE = { "--wind-rose-view-w": `${VIEW_SIZE}px` } as CSSProperties;
const SELECTED_ARC_PX = 4;
const SELECTED_ARC_EDGE_PX = 1;
const HIT_R_PAD_PX = SELECTED_ARC_PX / 2 + SELECTED_ARC_EDGE_PX;
const GUIDE_LABEL_PX = 9;
const GUIDE_PLATE_PAD_PX = 2;
const TIP_VIEWPORT_MARGIN_PX = 8;
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
  const svgRef = useRef<SVGSVGElement>(null);
  const layout = DEFAULT_WIND_ROSE_LAYOUT;
  const wedges = windRoseStackedWedges(stats, layout);
  const cardinals = windRoseCardinalPositions(layout);
  const guides = windRoseGuideLabelPositions(stats, layout);
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
      {guides.map((g) => {
        const text = `${g.pct}%`;
        const w = text.length * GUIDE_LABEL_PX * 0.6 + GUIDE_PLATE_PAD_PX * 2;
        const h = GUIDE_LABEL_PX + GUIDE_PLATE_PAD_PX * 2;
        return (
          <g key={g.pct} className="wind-rose-guide-label" data-sector={g.sector}>
            <rect x={g.x - w / 2} y={g.y - h / 2} width={w} height={h} rx={2} className="wind-rose-guide-plate" />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={GUIDE_LABEL_PX} fontFamily="var(--mono)">
              {text}
            </text>
          </g>
        );
      })}
      {CARDINALS.filter((c) => c.sector !== selected).map((c) => (
        <text
          key={c.key}
          x={cardinals[c.key].x}
          y={cardinals[c.key].y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={CARDINAL_LABEL_PX}
          fontWeight={600}
          fill={getColour(c.colour)}
          className="wind-rose-label"
        >
          {c.label}
        </text>
      ))}
    </>
  );

  const calm = <WindRoseCalm layout={layout} calmPercent={stats.calmPercent} />;

  if (!picker) {
    return (
      <div className="wind-rose-chart" style={CHART_STYLE}>
        <svg viewBox={VIEW_BOX} role="img" aria-hidden="true" className={className}>
          {rings}
          {wedges.map((w, index) => (
            <path key={index} d={w.d} fill={w.fill} fillOpacity={0.95} />
          ))}
          {labels}
        </svg>
        {calm}
      </div>
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
    <div
      className="wind-rose-chart wind-rose-picker"
      style={CHART_STYLE}
      data-hovering={active != null ? "true" : undefined}
      onPointerLeave={() => setHovered(null)}
    >
      <svg
        ref={svgRef}
        viewBox={VIEW_BOX}
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
        onBlur={() => setHovered(null)}
      >
        {rings}
        {SECTORS.map((sector) => (
          <g
            key={sector}
            className={petalClass(sector, active, selected)}
            data-sector={sector}
            onPointerEnter={() => setHovered(sector)}
            onPointerLeave={() => setHovered((h) => (h === sector ? null : h))}
            onClick={() => picker.onSelect(sector)}
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
            <path
              className="wind-rose-hit"
              data-sector={sector}
              d={annularSectorPath(layout.cx, layout.cy, 0, layout.outerR + HIT_R_PAD_PX, sectorCenterDeg(sector))}
            />
          </g>
        ))}
        {labels}
        {selected != null ? <SelectedSector layout={layout} sector={selected} /> : null}
      </svg>
      {calm}
      {active != null ? <WindRoseTip svg={svgRef.current} layout={layout} sector={active} text={picker.tip(active)} /> : null}
    </div>
  );
}

function WindRoseCalm({ layout, calmPercent }: { layout: WindRoseChartLayout; calmPercent: number }) {
  return (
    <span
      className="wind-rose-calm"
      style={{
        left: `${(layout.cx / VIEW_SIZE) * 100}%`,
        top: `${((layout.cy - VIEW_TOP) / VIEW_HEIGHT) * 100}%`,
      }}
    >
      <span>Calm</span> <span>{formatCalmPercent(calmPercent)}</span>
    </span>
  );
}

function petalClass(sector: number, hovered: number | null, selected: number | null): string {
  let name = "wind-rose-petal";
  if (sector === hovered) name += " is-hovered";
  if (sector === selected) name += " is-selected";
  return name;
}

function SelectedSector({ layout, sector }: { layout: WindRoseChartLayout; sector: number }) {
  const cardinal = CARDINALS.find((c) => c.sector === sector);
  const at = windRoseSectorPoint(layout, sector, layout.outerR + WIND_ROSE_SELECTED_LABEL_GAP_PX);
  const arc = windRoseSelectedArcPaths(layout, sector, SELECTED_ARC_EDGE_PX);
  return (
    <>
      <path className="wind-rose-selected-arc-edge" d={arc.edge} />
      <path className="wind-rose-selected-arc" d={arc.mark} />
      <text
        x={at.x}
        y={at.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={800}
        fill={getColour(cardinal?.colour ?? "--wind-rose-n-label")}
        className="wind-rose-label is-selected"
      >
        {sectorLabel(sector)}
      </text>
    </>
  );
}

function WindRoseTip({
  svg,
  layout,
  sector,
  text,
}: {
  svg: SVGSVGElement | null;
  layout: WindRoseChartLayout;
  sector: number;
  text: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; flipped: boolean } | null>(null);
  useLayoutEffect(() => {
    const tip = ref.current;
    if (!svg || !tip) return;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width > 0 ? rect.width / VIEW_SIZE : 1;
    const w = tip.offsetWidth / scale;
    const h = tip.offsetHeight / scale;
    const fits = (box: { x: number; y: number }) => {
      const left = rect.left + box.x * scale;
      return left >= TIP_VIEWPORT_MARGIN_PX && left + w * scale <= window.innerWidth - TIP_VIEWPORT_MARGIN_PX;
    };
    const box = windRoseTipBox(layout, sector, w, h, fits);
    setPos({ left: rect.left + box.x * scale, top: rect.top + (box.y - VIEW_TOP) * scale, flipped: box.flipped });
  }, [svg, layout, sector, text]);
  return createPortal(
    <span
      ref={ref}
      className={pos?.flipped ? "wind-rose-tip is-flipped" : "wind-rose-tip"}
      role="tooltip"
      data-sector={sector}
      style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { visibility: "hidden" }}
    >
      {text}
    </span>,
    document.body,
  );
}
