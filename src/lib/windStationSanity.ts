export const WIND_STATION_SANE_MAX_WINTER_CALM_PCT = 30;
export const WIND_STATION_SANE_MAX_ANNUAL_CALM_PCT = 35;
export const WIND_RECORD_MAX_CALM_EXCESS_PCT = 5;

export type WindCalmSeasons = {
  annual: { calmPct: number };
  winter: { calmPct: number };
};

export type WindCalmAllSeasons = WindCalmSeasons & {
  summer: { calmPct: number };
  autumn: { calmPct: number };
  spring: { calmPct: number };
};

const CALM_SEASON_IDS = ["annual", "summer", "autumn", "winter", "spring"] as const;

export function areWindSeasonsSane(seasons: WindCalmSeasons): boolean {
  return (
    seasons.winter.calmPct <= WIND_STATION_SANE_MAX_WINTER_CALM_PCT &&
    seasons.annual.calmPct <= WIND_STATION_SANE_MAX_ANNUAL_CALM_PCT
  );
}

export function isCalmConsistentWithRecent(seasons: WindCalmAllSeasons, recent: WindCalmAllSeasons): boolean {
  return CALM_SEASON_IDS.every(
    (id) => seasons[id].calmPct <= recent[id].calmPct + WIND_RECORD_MAX_CALM_EXCESS_PCT,
  );
}
