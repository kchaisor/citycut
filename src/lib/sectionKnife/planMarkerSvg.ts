import { getColour } from "../colours";
import type { SectionKnifeEntry } from "./state";
import type { CityModel } from "../../types";
import { sectionPlanMarkerGeometry } from "./marker";

function px(metres: number, metresPerPx: number): number {
  return metres / metresPerPx;
}

export function sectionMarkerPlanSvgPaths(
  model: CityModel,
  knives: SectionKnifeEntry[],
  selectedId: string,
  active: boolean,
  metresPerPx: number,
): string {
  if (!active || knives.length === 0) return "";
  const ink = getColour("--section-knife-marker-gold");
  const muted = getColour("--section-knife-elevation-grid");
  const parts: string[] = [];
  for (const knife of knives) {
    const g = sectionPlanMarkerGeometry(model, knife.pose);
    const x0 = g.east0;
    const y0 = -g.north0;
    const x1 = g.east1;
    const y1 = -g.north1;
    const selected = knife.id === selectedId;
    const stroke = selected ? ink : muted;
    const sw = px(selected ? 0.35 : 0.22, metresPerPx);
    const dash = `${px(2.4, metresPerPx)} ${px(0.55, metresPerPx)}`;
    parts.push(
      `<path d="M ${x0} ${y0} L ${x1} ${y1}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="square" vector-effect="non-scaling-stroke"/>`,
    );
    const te = g.tangentEast;
    const tn = -g.tangentNorth;
    const perpE = -tn;
    const perpN = te;
    const tick = px(0.85, metresPerPx);
    for (const [ex, ey] of [
      [x0, y0],
      [x1, y1],
    ]) {
      parts.push(
        `<path d="M ${ex - perpE * tick} ${ey - perpN * tick} L ${ex + perpE * tick} ${ey + perpN * tick}" stroke="${stroke}" stroke-width="${sw * 1.6}" vector-effect="non-scaling-stroke"/>`,
      );
    }
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const arrow = px(2.2, metresPerPx);
    const ve = g.viewEast;
    const vn = -g.viewNorth;
    const ax = mx + ve * arrow * 0.4;
    const ay = my + vn * arrow * 0.4;
    const wing = px(0.65, metresPerPx);
    const lx = ax - ve * wing + -vn * wing * 0.55;
    const ly = ay - vn * wing + ve * wing * 0.55;
    const rx = ax - ve * wing + vn * wing * 0.55;
    const ry = ay - vn * wing + -ve * wing * 0.55;
    parts.push(`<path d="M ${lx} ${ly} L ${ax} ${ay} L ${rx} ${ry}" fill="none" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke"/>`);
    const bubbleR = px(1.15, metresPerPx);
    const label = knife.label.endsWith("A") ? "A" : knife.label.replace(/^.*\s/, "").slice(0, 1) || "A";
    const bubbleStroke = selected ? ink : muted;
    parts.push(
      `<circle cx="${x0}" cy="${y0}" r="${bubbleR}" fill="var(--bg-elev)" stroke="${bubbleStroke}" stroke-width="${sw * 0.85}" vector-effect="non-scaling-stroke"/>`,
    );
    parts.push(
      `<circle cx="${x1}" cy="${y1}" r="${bubbleR}" fill="var(--bg-elev)" stroke="${bubbleStroke}" stroke-width="${sw * 0.85}" vector-effect="non-scaling-stroke"/>`,
    );
    const fs = px(1.05, metresPerPx);
    parts.push(
      `<text x="${x0}" y="${y0 + fs * 0.35}" text-anchor="middle" font-size="${fs}" font-family="var(--font-mono)" fill="${bubbleStroke}">${label === "A" ? "A" : label}</text>`,
    );
    parts.push(
      `<text x="${x1}" y="${y1 + fs * 0.35}" text-anchor="middle" font-size="${fs}" font-family="var(--font-mono)" fill="${bubbleStroke}">A′</text>`,
    );
  }
  return parts.join("");
}
