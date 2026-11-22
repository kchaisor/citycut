import { SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX } from "./solarSlider";

export const ENV_CONSOLE_INSET_PX = 13;
export const ENV_CONSOLE_SOLAR_CONTENT_PX = 1141;
export const SOLAR_BAR_GAP_PX = 8;
export const SOLAR_DATE_PRESETS_PX = 393;
export const SOLAR_BAR_SEPARATOR_PX = 1;
export const SOLAR_PLAY_PX = 43;
export const SOLAR_SUN_BOUND_PX = 42;
export const SOLAR_READOUT_PX = 96;
export const SOLAR_SCRUBBER_FLOOR_PX = 192;

export type SolarBottomRow = {
  wrapped: boolean;
  scrubberWidth: number;
  trackWidth: number;
  readoutClipPx: number;
  readoutPastBarPx: number;
};

export function solarScrubberFixedWidth(): number {
  return SOLAR_SUN_BOUND_PX * 2 + SOLAR_READOUT_PX + SOLAR_BAR_GAP_PX * 3;
}

export function solarScrubberContentWidth(): number {
  return solarScrubberFixedWidth() + SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX;
}

export function solarBottomLeadWidth(): number {
  return SOLAR_DATE_PRESETS_PX + SOLAR_BAR_SEPARATOR_PX + SOLAR_PLAY_PX + SOLAR_BAR_GAP_PX * 2;
}

export function solarBottomRow(barWidth: number, scrubberBasisPx: number): SolarBottomRow {
  const inner = barWidth - ENV_CONSOLE_INSET_PX * 2;
  const beside = solarBottomLeadWidth() + SOLAR_BAR_GAP_PX;
  const wrapped = beside + scrubberBasisPx > inner;
  const scrubberLeft = wrapped ? 0 : beside;
  const scrubberWidth = Math.max(scrubberBasisPx, inner - scrubberLeft);
  const contentRight = ENV_CONSOLE_INSET_PX + scrubberLeft + Math.max(scrubberWidth, solarScrubberContentWidth());
  return {
    wrapped,
    scrubberWidth,
    trackWidth: Math.max(SOLAR_SLIDER_LATE_TICK_MIN_TRACK_PX, scrubberWidth - solarScrubberFixedWidth()),
    readoutClipPx: Math.max(0, solarScrubberContentWidth() - scrubberWidth),
    readoutPastBarPx: Math.max(0, contentRight - barWidth),
  };
}
