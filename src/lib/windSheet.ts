import { COMFORT_SWATCH, windPlanSeasonLabel, windPlanTitle } from "../components/WindPlanCard";
import { getColour } from "./colours";
import type { NamedViewSnapshot } from "./namedViews";
import { WIND_DAYPARTS } from "./windDayparts";
import { findDesignWind, designWindsFor } from "./windDesignWinds";
import { formatCalmPercent, WIND_BAND_COLOUR_VARS, windSpeedBinRangeLabel } from "./windBins";
import { COMFORT_CLASSES, COMFORT_CLASS_LABELS, COMFORT_THRESHOLDS_MS } from "./windComfort";
import { comfortShareLabel, type ComfortShares } from "./windComfortShares";
import { windPlanLegendStops, windPlanSpeedTicks, type WindPlanMode } from "./windPlanField";
import type { WindPeriodStats } from "./windRose";
import { formatStationLine1, windRoseStationLines } from "./windRoseCaptions";
import {
  DEFAULT_WIND_ROSE_LAYOUT,
  WIND_ROSE_FREQUENCY_GUIDES,
  windRoseCardinalPositions,
  windRoseStackedWedges,
} from "./windRoseChart";
import type { SiteWindSelection } from "./windRoseData";
import { analyzeSiteWind } from "./windRoseStats";
import { scaleBarLengthM, type SheetFrame } from "./sheetScale";
import { cutMarginTrim } from "./sheetFraming";
import type { WindPlanViewId } from "./windState";
import { windPrevailingBadge } from "../components/model/windRoseCard";

export type SheetRect = { x: number; y: number; width: number; height: number };

export type WindSheetLayout = {
  width: number;
  height: number;
  unit: number;
  margin: number;
  gutter: number;
  main: SheetRect;
  column: SheetRect;
  titleHeight: number;
  rose: SheetRect;
};

export type WindSheetKind = "normal" | "highQuality";

export const WIND_SHEET_SIZES: Record<WindSheetKind, { width: number; height: number }> = {
  normal: { width: 2480, height: 1754 },
  highQuality: { width: 4961, height: 3508 },
};

const BASE_SHEET_WIDTH = 2480;
const GRID_PX = 8;
const MARGIN_UNITS = 9;
const GUTTER_UNITS = 8;
const COLUMN_SHARE = 0.25;
const TITLE_UNITS = 20;
const ROSE_SHARE = 0.8;
const TYPE_RATIO = 1.25;
const BASE_FONT_PX = 22.5;
const ROSE_EXTENT = 216;
const ROSE_FONT_CARDINAL = 11;
const ROSE_FONT_CALM = 8;
const WIND_BAND_COUNT = WIND_BAND_COLOUR_VARS.length;
const CFD_NOTE = "Indicative only, not a CFD study";
const ROSE_RINGS_KEY = `Rings ${WIND_ROSE_FREQUENCY_GUIDES.map((frac) => `${Math.round(frac * 100)}%`).join(" / ")}`;
const REGIONAL_NOTE = "Regional station, not site wind";
const COMFORT_LIMITS_MS = COMFORT_THRESHOLDS_MS.slice(0, COMFORT_CLASSES.length - 1);

export type WindSheetInput = {
  siteName: string;
  viewName: string;
  stats: WindPeriodStats;
  seasonTimeLabel: string;
  prevailing: string;
  calm: string | null;
  mode: WindPlanMode;
  planView: WindPlanViewId;
  scaleMaxMs: number | null;
  comfortShares: ComfortShares | null;
  stationLine: string;
  sourceLine: string;
};

export type WindSheetSource = {
  selection: SiteWindSelection | null;
  scaleMaxMs: number | null;
  comfortShares: ComfortShares | null;
};

export type WindSheetStyle = {
  page: string;
  ink: string;
  inkMuted: string;
  rule: string;
  sans: string;
  mono: string;
};

export type WindSheetCapture = {
  source: CanvasImageSource;
  width: number;
  height: number;
  frame: SheetFrame | null;
  trim?: SheetRect | null;
};

export type PixelGrid = { data: ArrayLike<number>; width: number; height: number };

export type Rgb = { r: number; g: number; b: number };

const TRIM_TOLERANCE = 4;

export function contentBounds(image: PixelGrid, background: Rgb | null, tolerance = TRIM_TOLERANCE): SheetRect | null {
  const { data, width, height } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      if (data[at + 3]! === 0) continue;
      if (
        background &&
        Math.abs(data[at]! - background.r) <= tolerance &&
        Math.abs(data[at + 1]! - background.g) <= tolerance &&
        Math.abs(data[at + 2]! - background.b) <= tolerance
      )
        continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function trimmedFrame(frame: SheetFrame, captureWidth: number, trim: SheetRect | null): SheetFrame {
  if (!trim || !(captureWidth > 0)) return frame;
  return { ...frame, metresAcross: (frame.metresAcross * trim.width) / captureWidth };
}

export type WindSheetMetrics = { planLegendEnd: number; furniture: { top: number; bottom: number } | null; notesRule: number };

export function windSheetCropOption(highQuality: boolean): { aspect: number; minWidthPx: number } {
  const size = WIND_SHEET_SIZES[highQuality ? "highQuality" : "normal"];
  const { main } = windSheetLayout(size.width, size.height);
  return { aspect: main.width / main.height, minWidthPx: main.width };
}

export function isWindSheetView(snapshot: Pick<NamedViewSnapshot, "tab" | "view" | "analyses">): boolean {
  return snapshot.tab === "3d" && snapshot.view.projection === "plan" && snapshot.analyses.wind;
}

export function windSheetLayout(width: number, height: number): WindSheetLayout {
  const unit = (GRID_PX * width) / BASE_SHEET_WIDTH;
  const margin = Math.round(MARGIN_UNITS * unit);
  const gutter = Math.round(GUTTER_UNITS * unit);
  const contentWidth = width - 2 * margin;
  const contentHeight = height - 2 * margin;
  const columnWidth = Math.round((contentWidth * COLUMN_SHARE) / unit) * unit;
  const column: SheetRect = {
    x: Math.round(width - margin - columnWidth),
    y: margin,
    width: Math.round(columnWidth),
    height: contentHeight,
  };
  const main: SheetRect = {
    x: margin,
    y: margin,
    width: column.x - gutter - margin,
    height: contentHeight,
  };
  const titleHeight = Math.round(TITLE_UNITS * unit);
  const roseSide = Math.round(column.width * ROSE_SHARE);
  const rose: SheetRect = { x: Math.round(column.x + (column.width - roseSide) / 2), y: column.y + titleHeight, width: roseSide, height: roseSide };
  return { width, height, unit, margin, gutter, main, column, titleHeight, rose };
}

export function containRect(sourceWidth: number, sourceHeight: number, box: SheetRect): SheetRect {
  const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  return { x: Math.round(box.x + (box.width - width) / 2), y: Math.round(box.y + (box.height - height) / 2), width, height };
}

export function windSheetInput(
  source: WindSheetSource,
  snapshot: NamedViewSnapshot,
  siteName: string,
  viewName: string,
): WindSheetInput | null {
  const { selection } = source;
  if (!selection) return null;
  const { period, daypart } = snapshot.wind;
  const stats = analyzeSiteWind(selection, period, daypart);
  if (!stats) return null;
  const design = findDesignWind(designWindsFor(selection), snapshot.wind.designWind);
  const season = design ? `Design ${design.label}` : windPlanSeasonLabel(period);
  const badge = windPrevailingBadge(stats, true);
  return {
    siteName,
    viewName,
    stats,
    seasonTimeLabel: `${season} · ${WIND_DAYPARTS[daypart].label}`,
    prevailing: badge.prevailing,
    calm: badge.calm,
    mode: snapshot.windPlan.mode,
    planView: snapshot.windPlan.view,
    scaleMaxMs: source.scaleMaxMs,
    comfortShares: source.comfortShares,
    stationLine: formatStationLine1(selection).replace(/⁠/g, "").replace(/ /g, " "),
    sourceLine: windRoseStationLines(selection).line2,
  };
}

export function readWindSheetStyle(root: HTMLElement = document.documentElement): WindSheetStyle {
  const css = getComputedStyle(root);
  const token = (name: string) => css.getPropertyValue(name).trim();
  return {
    page: token("--bg-elev"),
    ink: token("--ink"),
    inkMuted: token("--ink-2"),
    rule: token("--ink-3"),
    sans: token("--sans"),
    mono: token("--mono"),
  };
}

type Fonts = { sans: (step: number, weight?: number) => string; mono: (step: number, weight?: number) => string };

function fontSizePx(layout: WindSheetLayout, step: number): number {
  return Math.round(BASE_FONT_PX * TYPE_RATIO ** step * (layout.width / BASE_SHEET_WIDTH));
}

function fontsFor(layout: WindSheetLayout, style: WindSheetStyle): Fonts {
  return {
    sans: (step, weight = 500) => `${weight} ${fontSizePx(layout, step)}px ${style.sans}`,
    mono: (step, weight = 500) => `${weight} ${fontSizePx(layout, step)}px ${style.mono}`,
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

type Pen = { ctx: CanvasRenderingContext2D; layout: WindSheetLayout; style: WindSheetStyle; fonts: Fonts };

function text(
  pen: Pen,
  value: string,
  x: number,
  y: number,
  font: string,
  colour: string,
  align: CanvasTextAlign = "left",
  baseline: CanvasTextBaseline = "alphabetic",
): void {
  pen.ctx.font = font;
  pen.ctx.fillStyle = colour;
  pen.ctx.textAlign = align;
  pen.ctx.textBaseline = baseline;
  pen.ctx.fillText(value, x, y);
}

function paragraph(pen: Pen, value: string, x: number, y: number, maxWidth: number, font: string, colour: string, step: number): number {
  pen.ctx.font = font;
  const lineHeight = Math.round(fontSizePx(pen.layout, step) * 1.4);
  let cursor = y;
  for (const line of wrapText(pen.ctx, value, maxWidth)) {
    text(pen, line, x, cursor + fontSizePx(pen.layout, step), font, colour);
    cursor += lineHeight;
  }
  return cursor;
}

function hairlinePx(layout: WindSheetLayout): number {
  return Math.max(1, Math.round(layout.width / BASE_SHEET_WIDTH));
}

function rule(pen: Pen, y: number): void {
  const { ctx, layout, style } = pen;
  ctx.strokeStyle = style.rule;
  ctx.lineWidth = hairlinePx(layout);
  ctx.beginPath();
  ctx.moveTo(layout.column.x, y);
  ctx.lineTo(layout.column.x + layout.column.width, y);
  ctx.stroke();
}

function kicker(pen: Pen, label: string, y: number): number {
  const size = fontSizePx(pen.layout, -1);
  text(pen, label.toUpperCase(), pen.layout.column.x, y + size, pen.fonts.sans(-1, 700), pen.style.inkMuted);
  return y + Math.round(size * 1.6);
}

function drawRose(pen: Pen, stats: WindPeriodStats): void {
  const { ctx, layout, style } = pen;
  const rose = DEFAULT_WIND_ROSE_LAYOUT;
  const scale = layout.rose.width / ROSE_EXTENT;
  ctx.save();
  ctx.translate(layout.rose.x + layout.rose.width / 2, layout.rose.y + layout.rose.height / 2);
  ctx.scale(scale, scale);
  ctx.translate(-rose.cx, -rose.cy);
  ctx.lineWidth = 1;
  ctx.strokeStyle = getColour("--wind-rose-ring");
  ctx.beginPath();
  ctx.arc(rose.cx, rose.cy, rose.outerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = getColour("--wind-rose-guide");
  ctx.setLineDash([4, 3]);
  for (const frac of WIND_ROSE_FREQUENCY_GUIDES) {
    ctx.beginPath();
    ctx.arc(rose.cx, rose.cy, rose.petalMaxR * frac, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.95;
  for (const wedge of windRoseStackedWedges(stats, rose)) {
    ctx.fillStyle = wedge.fill;
    ctx.fill(new Path2D(wedge.d));
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = getColour("--wind-rose-card-surface");
  ctx.beginPath();
  ctx.arc(rose.cx, rose.cy, rose.hubR, 0, Math.PI * 2);
  ctx.fill();
  const mono = `500 ${ROSE_FONT_CALM}px ${style.mono}`;
  const marks = windRoseCardinalPositions(rose);
  const markFont = `600 ${ROSE_FONT_CARDINAL}px ${style.sans}`;
  text(pen, "N", marks.n.x, marks.n.y, markFont, getColour("--wind-rose-n-label"), "center", "middle");
  text(pen, "E", marks.e.x, marks.e.y, markFont, getColour("--wind-rose-h-label"), "center", "middle");
  text(pen, "S", marks.s.x, marks.s.y, markFont, getColour("--wind-rose-h-label"), "center", "middle");
  text(pen, "W", marks.w.x, marks.w.y, markFont, getColour("--wind-rose-h-label"), "center", "middle");
  text(pen, "Calm", rose.cx, rose.cy - 4, `500 ${ROSE_FONT_CALM}px ${style.sans}`, getColour("--wind-calm-caption"), "center", "middle");
  text(pen, formatCalmPercent(stats.calmPercent), rose.cx, rose.cy + 6, mono, getColour("--wind-calm-caption"), "center", "middle");
  ctx.restore();
}

function drawBandLegend(pen: Pen, y: number): number {
  const { layout, fonts, style } = pen;
  const cursor = kicker(pen, "Wind speed", y);
  const row = Math.round(fontSizePx(layout, 0) * 1.5);
  const swatch = Math.round(layout.unit * 2);
  let at = cursor;
  for (let band = 0; band < WIND_BAND_COUNT; band++) {
    pen.ctx.fillStyle = getColour(WIND_BAND_COLOUR_VARS[band]!);
    pen.ctx.fillRect(layout.column.x, at + Math.round((row - swatch) / 2), swatch * 2, swatch);
    text(pen, windSpeedBinRangeLabel(band), layout.column.x + swatch * 3, at + row / 2, fonts.mono(-1), style.ink, "left", "middle");
    at += row;
  }
  return at;
}

function drawPlanLegend(pen: Pen, input: WindSheetInput, y: number): number {
  const comfort = input.mode === "comfort" && input.planView !== "flow";
  const { ctx, layout, fonts, style } = pen;
  const column = layout.column;
  let cursor = kicker(pen, windPlanTitle({ mode: comfort ? "comfort" : "speed" }), y);
  const barHeight = Math.round(layout.unit * 2.5);
  const caption = comfort ? "Comfort (m/s, 5% of the time)" : "Velocity (m/s)";
  text(pen, caption, column.x, cursor + fontSizePx(layout, -1), fonts.sans(-1, 600), style.ink);
  cursor += Math.round(fontSizePx(layout, -1) * 1.6);
  if (comfort) {
    const segment = column.width / COMFORT_CLASSES.length;
    COMFORT_CLASSES.forEach((cls, k) => {
      ctx.fillStyle = getColour(COMFORT_SWATCH[cls]);
      ctx.fillRect(Math.round(column.x + k * segment), cursor, Math.ceil(segment), barHeight);
    });
    cursor += barHeight + Math.round(layout.unit);
    COMFORT_LIMITS_MS.forEach((limit, k) => {
      text(pen, String(limit), column.x + ((k + 1) / COMFORT_CLASSES.length) * column.width, cursor + fontSizePx(layout, -1), fonts.mono(-1), style.ink, "center");
    });
    cursor += Math.round(fontSizePx(layout, -1) * 1.8);
    const row = Math.round(fontSizePx(layout, 0) * 1.5);
    const swatch = Math.round(layout.unit * 1.75);
    for (const cls of COMFORT_CLASSES) {
      ctx.fillStyle = getColour(COMFORT_SWATCH[cls]);
      ctx.fillRect(column.x, cursor + Math.round((row - swatch) / 2), swatch, swatch);
      text(pen, COMFORT_CLASS_LABELS[cls], column.x + swatch * 2, cursor + row / 2, fonts.sans(-1), style.ink, "left", "middle");
      const share = input.comfortShares?.[cls];
      if (share != null) text(pen, comfortShareLabel(share), column.x + column.width, cursor + row / 2, fonts.mono(-1), style.ink, "right", "middle");
      cursor += row;
    }
    return cursor;
  }
  const gradient = ctx.createLinearGradient(column.x, 0, column.x + column.width, 0);
  for (const stop of windPlanLegendStops(input.scaleMaxMs ?? undefined)) gradient.addColorStop(stop.pct / 100, getColour(stop.token));
  ctx.fillStyle = gradient;
  ctx.fillRect(column.x, cursor, column.width, barHeight);
  cursor += barHeight + Math.round(layout.unit);
  if (input.scaleMaxMs != null) {
    const labelFont = fonts.mono(-1);
    for (const tick of windPlanSpeedTicks(input.scaleMaxMs)) {
      const fraction = tick / input.scaleMaxMs;
      ctx.font = labelFont;
      const width = ctx.measureText(String(tick)).width;
      text(pen, String(tick), column.x + fraction * column.width - fraction * width, cursor + fontSizePx(layout, -1), labelFont, style.ink);
    }
    cursor += Math.round(fontSizePx(layout, -1) * 1.8);
  }
  return cursor;
}

function drawNorthArrow(pen: Pen, cx: number, cy: number, northRad: number): void {
  const { ctx, layout, style } = pen;
  const half = layout.unit * 4;
  const head = layout.unit * 2.5;
  const wing = layout.unit * 1.25;
  const labelGap = layout.unit + fontSizePx(layout, 0) / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(northRad);
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = hairlinePx(layout) * 2;
  ctx.beginPath();
  ctx.moveTo(0, half);
  ctx.lineTo(0, -half + head);
  ctx.stroke();
  ctx.fillStyle = style.ink;
  ctx.beginPath();
  ctx.moveTo(0, -half);
  ctx.lineTo(wing, -half + head);
  ctx.lineTo(-wing, -half + head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const reach = half + labelGap;
  text(pen, "N", cx + Math.sin(northRad) * reach, cy - Math.cos(northRad) * reach, pen.fonts.sans(0, 700), style.ink, "center", "middle");
}

function drawScaleBar(pen: Pen, x: number, centreY: number, lengthPx: number, lengthM: number): void {
  const { ctx, layout, style, fonts } = pen;
  const thickness = Math.round(layout.unit);
  const top = Math.round(centreY - thickness);
  const segments = 4;
  const segment = lengthPx / segments;
  ctx.lineWidth = hairlinePx(layout);
  ctx.strokeStyle = style.ink;
  for (let k = 0; k < segments; k++) {
    ctx.fillStyle = k % 2 === 0 ? style.ink : style.page;
    ctx.fillRect(x + k * segment, top, segment, thickness);
  }
  ctx.strokeRect(x, top, lengthPx, thickness);
  const labelY = top + thickness + Math.round(layout.unit * 0.75) + fontSizePx(layout, -1);
  text(pen, "0", x, labelY, fonts.mono(-1), style.ink, "center");
  text(pen, `${lengthM} m`, x + lengthPx, labelY, fonts.mono(-1), style.ink, "center");
}

function furnitureHeight(layout: WindSheetLayout): number {
  return 2 * (layout.unit * 4 + layout.unit + fontSizePx(layout, 0) / 2);
}

function drawFurniture(pen: Pen, image: SheetRect, frame: SheetFrame | null, top: number): void {
  if (!frame) return;
  const { layout } = pen;
  const column = layout.column;
  const height = furnitureHeight(layout);
  const centreY = top + height / 2;
  let x = column.x;
  if (frame.northRad != null) {
    drawNorthArrow(pen, column.x + height / 2, centreY, frame.northRad);
    x += height + Math.round(layout.unit * 3);
  }
  const lengthM = scaleBarLengthM(frame.metresAcross);
  const lengthPx = (lengthM / frame.metresAcross) * image.width;
  pen.ctx.font = pen.fonts.mono(-1);
  const reserve = pen.ctx.measureText(`${lengthM} m`).width / 2;
  if (lengthM > 0 && x + lengthPx + reserve <= column.x + column.width) drawScaleBar(pen, x, centreY, lengthPx, lengthM);
}

export function drawWindSheet(
  ctx: CanvasRenderingContext2D,
  layout: WindSheetLayout,
  capture: WindSheetCapture,
  input: WindSheetInput,
  style: WindSheetStyle,
  options: { transparent: boolean },
): WindSheetMetrics {
  const pen: Pen = { ctx, layout, style, fonts: fontsFor(layout, style) };
  const { column, main, unit } = layout;
  const { fonts } = pen;
  if (!options.transparent) {
    ctx.fillStyle = style.page;
    ctx.fillRect(0, 0, layout.width, layout.height);
  }
  const trim = capture.trim ?? { x: 0, y: 0, width: capture.width, height: capture.height };
  const image = containRect(trim.width, trim.height, main);
  ctx.drawImage(capture.source, trim.x, trim.y, trim.width, trim.height, image.x, image.y, image.width, image.height);
  ctx.strokeStyle = style.rule;
  ctx.lineWidth = hairlinePx(layout);
  ctx.strokeRect(image.x - 0.5, image.y - 0.5, image.width + 1, image.height + 1);

  let titleSize = fontSizePx(layout, 4);
  ctx.font = fonts.sans(4, 700);
  const titleWidth = ctx.measureText(input.siteName).width;
  if (titleWidth > column.width) titleSize = Math.floor((titleSize * column.width) / titleWidth);
  text(pen, input.siteName, column.x, column.y + titleSize, `700 ${titleSize}px ${style.sans}`, style.ink);
  paragraph(pen, input.viewName, column.x, column.y + Math.round(titleSize * 1.3), column.width, fonts.sans(1), style.inkMuted, 1);

  drawRose(pen, input.stats);

  let cursor = layout.rose.y + layout.rose.height;
  cursor += Math.round(unit);
  text(pen, ROSE_RINGS_KEY, layout.rose.x + layout.rose.width / 2, cursor + fontSizePx(layout, -1), fonts.mono(-1), style.inkMuted, "center");
  cursor += fontSizePx(layout, -1) + Math.round(unit * 2);
  text(pen, input.seasonTimeLabel, column.x, cursor + fontSizePx(layout, 1), fonts.sans(1, 600), style.ink);
  cursor += Math.round(fontSizePx(layout, 1) * 1.6);
  text(pen, input.prevailing, column.x, cursor + fontSizePx(layout, 0), fonts.mono(0, 600), style.ink);
  cursor += Math.round(fontSizePx(layout, 0) * 1.5);
  if (input.calm) {
    text(pen, input.calm, column.x, cursor + fontSizePx(layout, -1), fonts.mono(-1), style.inkMuted);
    cursor += Math.round(fontSizePx(layout, -1) * 1.6);
  }

  cursor += Math.round(unit * 2);
  rule(pen, cursor);
  cursor = drawBandLegend(pen, cursor + Math.round(unit * 2));

  cursor += Math.round(unit * 2);
  rule(pen, cursor);
  const planLegendEnd = drawPlanLegend(pen, input, cursor + Math.round(unit * 2));

  const noteLine = Math.round(fontSizePx(layout, -1) * 1.5);
  ctx.font = fonts.sans(-1);
  const stationLines = wrapText(ctx, input.stationLine, column.width);
  const notes = [...stationLines, input.sourceLine, REGIONAL_NOTE, CFD_NOTE];
  const notesTop = column.y + column.height - notes.length * noteLine;
  const notesRule = notesTop - Math.round(unit * 2);
  rule(pen, notesRule);
  notes.forEach((line, index) => {
    const colour = line === CFD_NOTE ? style.ink : style.inkMuted;
    text(pen, line, column.x, notesTop + index * noteLine + fontSizePx(layout, -1), fonts.sans(-1), colour);
  });

  const height = furnitureHeight(layout);
  const furnitureTop = notesRule - Math.round(unit * 2) - height;
  const frame = capture.frame ? trimmedFrame(capture.frame, capture.width, capture.trim ?? null) : null;
  const fits = frame != null && furnitureTop - Math.round(unit * 2) >= planLegendEnd + Math.round(unit);
  if (fits) {
    rule(pen, furnitureTop - Math.round(unit * 2));
    drawFurniture(pen, image, frame, furnitureTop);
  }
  return { planLegendEnd, furniture: fits ? { top: furnitureTop, bottom: furnitureTop + height } : null, notesRule };
}

async function loadSheetFonts(style: WindSheetStyle, layout: WindSheetLayout): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const fonts = fontsFor(layout, style);
  await Promise.all([fonts.sans(0, 500), fonts.sans(0, 600), fonts.sans(0, 700), fonts.mono(0, 500), fonts.mono(0, 600)].map((font) => document.fonts.load(font).catch(() => [])));
  await document.fonts.ready;
}

function measureTrim(bitmap: ImageBitmap, page: string, transparent: boolean): SheetRect | null {
  const probe = document.createElement("canvas");
  probe.width = bitmap.width;
  probe.height = bitmap.height;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let background: Rgb | null = null;
  if (!transparent) {
    ctx.fillStyle = page;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    background = { r: r!, g: g!, b: b! };
    ctx.clearRect(0, 0, 1, 1);
  }
  ctx.drawImage(bitmap, 0, 0);
  return contentBounds(ctx.getImageData(0, 0, bitmap.width, bitmap.height), background);
}

export async function composeWindSheet(
  capture: Blob,
  input: WindSheetInput,
  options: { highQuality: boolean; transparent: boolean; frame: SheetFrame | null; cutMargin?: number },
): Promise<Uint8Array> {
  const size = WIND_SHEET_SIZES[options.highQuality ? "highQuality" : "normal"];
  const layout = windSheetLayout(size.width, size.height);
  const style = readWindSheetStyle();
  await loadSheetFonts(style, layout);
  const bitmap = await createImageBitmap(capture);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the wind sheet.");
    const cutTrim =
      options.cutMargin != null && options.frame?.cutM
        ? cutMarginTrim(bitmap, options.frame.metresAcross, options.frame.cutM, options.cutMargin)
        : null;
    const trim = cutTrim ?? measureTrim(bitmap, style.page, options.transparent);
    drawWindSheet(ctx, layout, { source: bitmap, width: bitmap.width, height: bitmap.height, frame: options.frame, trim }, input, style, {
      transparent: options.transparent,
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not encode the wind sheet.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}
