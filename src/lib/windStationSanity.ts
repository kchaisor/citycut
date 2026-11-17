export const WIND_STATION_SANE_MAX_WINTER_CALM_PCT = 30;
export const WIND_STATION_SANE_MAX_ANNUAL_CALM_PCT = 35;

export type WindCalmSeasons = {
  annual: { calmPct: number };
  winter: { calmPct: number };
};

export function areWindSeasonsSane(seasons: WindCalmSeasons): boolean {
  return (
    seasons.winter.calmPct <= WIND_STATION_SANE_MAX_WINTER_CALM_PCT &&
    seasons.annual.calmPct <= WIND_STATION_SANE_MAX_ANNUAL_CALM_PCT
  );
}
