import { fetchWindRoseTable } from "../src/lib/windFetch.ts";
import { analyzeWindPeriod } from "../src/lib/windRose.ts";

const lat = -37.8207;
const lon = 145.1053;
const result = await fetchWindRoseTable(lat, lon);
if (!result.ok) {
  console.error(result.quietNote);
  process.exit(1);
}
const annual = analyzeWindPeriod(result.table, "annual");
const summer = analyzeWindPeriod(result.table, "summer");
console.log(
  JSON.stringify(
    {
      annual: {
        prevailing: annual.prevailingLabel,
        calmPercent: Math.round(annual.calmPercent * 10) / 10,
        medianKmh: annual.prevailingMedianKmh,
      },
      summer: {
        prevailing: summer.prevailingLabel,
        calmPercent: Math.round(summer.calmPercent * 10) / 10,
        medianKmh: summer.prevailingMedianKmh,
      },
      fromCache: result.fromCache,
    },
    null,
    2,
  ),
);
