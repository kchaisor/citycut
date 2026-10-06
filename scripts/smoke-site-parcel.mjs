/**
 * Live Vicmap Property smoke test (not run in CI).
 * Run: npx vite-node scripts/smoke-site-parcel.mjs
 */
import { fetchSiteParcelAtPoint, siteParcelQueryUrl } from "../src/lib/vicmapSiteParcel.ts";

const POINT = { lon: 145.1266505, lat: -37.8187756 };
const CENTER = { ...POINT };
const SIDE_M = 400;

const url = siteParcelQueryUrl(POINT);
console.log("query url:", url);

const parcel = await fetchSiteParcelAtPoint(POINT, CENTER, SIDE_M / 2);
if (!parcel) {
  console.error("No parcel returned.");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      parcelPfi: parcel.parcelPfi,
      parcelSpi: parcel.parcelSpi,
      polygonCount: parcel.polygons.length,
      boundarySegmentCount: parcel.boundaryLines.length,
    },
    null,
    2,
  ),
);
