import { screenPenAttrs } from "../lib/drawingStyle";
import { getColour } from "../lib/colours";
import { type NswPlanItems } from "../lib/nswPlan";
import type { NswPlanStyle } from "../lib/nswPlanStyle";
import { svgPolyline, svgRings } from "../lib/svgPlan";
import type { Pt } from "../types";

/** NSW mode site-plan layers. Rendered only when the model carries NSW layers. */

const segmentsPath = (segments: [Pt, Pt][]) =>
  segments.map(([a, b]) => `M${a[0].toFixed(1)} ${(-a[1]).toFixed(1)}L${b[0].toFixed(1)} ${(-b[1]).toFixed(1)}`).join("");

/** Zoning tint and cadastral road corridors, drawn just above the block ground. */
export function NswPlanUnder({ items, style }: { items: NswPlanItems; style: NswPlanStyle }) {
  return (
    <g data-layer="nsw-under">
      {items.zoning.map((zone, index) => (
        <path key={`z${index}`} d={svgRings(zone.rings)} fill={getColour(zone.colour)} fillOpacity={style.zoningOpacity} fillRule="evenodd" stroke="none" />
      ))}
      {items.corridors.length > 0 && (
        <path d={items.corridors.map((rings) => svgRings(rings)).join(" ")} fill={style.corridorFill} fillRule="nonzero" stroke="none" />
      )}
      {/* Decoded lot / easement / corridor attributes as native hover text; invisible, under the buildings. */}
      <g data-layer="nsw-records" fill="transparent" stroke="none" pointerEvents="fill">
        {items.records.map((record, index) => (
          <path key={`r${index}`} d={svgRings(record.rings)} fillRule="evenodd">
            <title>{record.text}</title>
          </path>
        ))}
      </g>
    </g>
  );
}

/** Lots, easements, heritage hatch and road centrelines, above the road fill and below buildings. */
export function NswPlanLines({ items, style }: { items: NswPlanItems; style: NswPlanStyle }) {
  return (
    <g data-layer="nsw-lines" fill="none">
      {items.lots.length > 0 && <path d={items.lots.map((rings) => svgRings(rings)).join(" ")} {...screenPenAttrs(style.lot, "miter")} />}
      {items.heritageHatch.length > 0 && (
        <path d={segmentsPath(items.heritageHatch)} {...screenPenAttrs({ ...style.heritage, mm: style.heritage.mm * 0.6, dash: "none" })} />
      )}
      {items.heritage.length > 0 && <path d={items.heritage.map((rings) => svgRings(rings)).join(" ")} {...screenPenAttrs(style.heritage, "miter")} />}
      {items.easementHatch.length > 0 && (
        <path d={segmentsPath(items.easementHatch)} {...screenPenAttrs({ ...style.easement, mm: style.easement.mm * 0.6, dash: "none" })} />
      )}
      {items.easements.length > 0 && <path d={items.easements.map((rings) => svgRings(rings)).join(" ")} {...screenPenAttrs(style.easement, "miter")} />}
      {items.centrelines.map((line, index) => (
        <path key={`cl${index}`} d={svgPolyline(line, false)} {...screenPenAttrs(style.centreline)} />
      ))}
    </g>
  );
}

/** Zone codes, height of building (RL spelled out) and FSR labels. Plain fills, no outline or halo. */
export function NswPlanLabels({ items, style, sizeM }: { items: NswPlanItems; style: NswPlanStyle; sizeM: number }) {
  const colour = { zone: style.zoneLabel, hob: style.hobLabel, fsr: style.fsrLabel } as const;
  return (
    <g data-layer="nsw-labels" fontFamily="Helvetica, Arial, sans-serif" textAnchor="middle" pointerEvents="none">
      {items.labels.map((label, index) => (
        <text
          key={`nl${index}`}
          x={label.at[0]}
          y={-label.at[1]}
          fontSize={sizeM}
          fontWeight={label.kind === "zone" ? 700 : 500}
          fill={colour[label.kind]}
          dominantBaseline="middle"
        >
          {label.text}
        </text>
      ))}
    </g>
  );
}
