import { performance } from "node:perf_hooks";
import { fetchSiteParcelAtPoint } from "../src/lib/vicmapSiteParcel.ts";

const point = { lon: 145.0518, lat: -37.8122 };
const center = { lon: 145.0515, lat: -37.812 };
const sideM = 400;

const t0 = performance.now();
const parcel = await fetchSiteParcelAtPoint(point, center, sideM / 2);
const fetchMs = Math.round(performance.now() - t0);

console.log(
  JSON.stringify({
    fetchMs,
    parcelPfi: parcel?.parcelPfi ?? null,
    boundarySegments: parcel?.boundaryLines.length ?? 0,
  }),
);
