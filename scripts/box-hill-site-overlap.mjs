/**
 * Live overlap report for 1022 Whitehorse Rd (not run in CI).
 * Run: npx vite-node scripts/box-hill-site-overlap.mjs
 */
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";
import { resolveSiteFrame } from "../src/lib/site.ts";
import { siteBuildingOverlaps } from "../src/lib/siteBuildings.ts";

const anchor = { lon: 145.1266505, lat: -37.8187756 };
const center = { ...anchor };
const sideM = 400;

const overture = await fetchOvertureBuildingsForCut(center, sideM);
const site = await resolveSiteFrame({
  anchor,
  center,
  sideM,
  buildings: overture.buildings,
});

const overlaps =
  site.parcel != null
    ? siteBuildingOverlaps(overture.buildings, site.parcel.polygons).filter((row) => row.selected)
    : [];

console.log(
  JSON.stringify(
    {
      parcelPfi: site.parcel?.parcelPfi ?? null,
      parcelSpi: site.parcel?.parcelSpi ?? null,
      siteBuildingIds: site.siteBuildingIds,
      selectedOverlaps: overlaps.map((row) => ({
        id: row.id,
        overlapPercent: Math.round(row.overlapFraction * 1000) / 10,
      })),
    },
    null,
    2,
  ),
);
