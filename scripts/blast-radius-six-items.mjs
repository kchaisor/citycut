/**
 * Blast-radius proof (items 2 & 6): parcel cache avoids a second Vicmap hit;
 * Wind-off site plan has no Wind layer; flow arrows only when Wind export runs.
 */
import { performance } from "node:perf_hooks";
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import { sitePlanChunks } from "../src/lib/aiPlan.ts";
import { dashSegments, DEFAULT_LINE_STYLES } from "../src/lib/drawingStyle.ts";
import { getColour } from "../src/lib/colours.ts";
import { arrowBoundsReport, buildWindArrowBuffer } from "../src/lib/windArrowGeometry.ts";
import { clearSiteParcelCacheForTests, fetchSiteParcelCached } from "../src/lib/sitePreviewCache.ts";

const m = {
  placeLabel: "Test",
  center: { lat: -37.8136, lon: 144.9631 },
  sideM: 400,
  roadKm: 0,
  buildingCapHit: false,
  buildings: [
    {
      id: 1,
      ring: [
        [0, 0],
        [30, 0],
        [30, 30],
        [0, 30],
        [0, 0],
      ],
      holes: [],
      height: 12,
      use: "retail",
      source: "osm_tag",
    },
  ],
  roads: [],
  areas: [],
  trees: [],
  layers: { buildings: true, roads: true, waterGreen: true, trees: false },
  sourceNote: "test",
  siteBoundaryLines: [
    [
      [-50, -50],
      [50, -50],
    ],
  ],
};

clearSiteParcelCacheForTests();
let vicmapCalls = 0;
const fetchImpl = async () => {
  vicmapCalls += 1;
  return { features: [] };
};
const anchor = { lat: -37.814, lon: 144.964 };
const center = m.center;
await fetchSiteParcelCached(anchor, center, m.sideM, { fetchImpl });
await fetchSiteParcelCached(anchor, center, m.sideM, { fetchImpl });

const t0 = performance.now();
const group = buildCityGroup(m, { uniformBuildings: false });
group.updateMatrixWorld(true);
const buildMs = performance.now() - t0;
const boundary = group.getObjectByName("Site::Boundary");
const chunks = sitePlanChunks(m, 1000, DEFAULT_LINE_STYLES, { castShadows: false });
const chunkNames = chunks.map((c) => c.name);
disposeObject(group);

const uniformWhite = getColour("--building-uniform").toUpperCase() === "#FFFFFF";
const dash = dashSegments(DEFAULT_LINE_STYLES.siteBoundary.dash);
const windLayer = chunkNames.includes("Wind");
const arrowBuffer = buildWindArrowBuffer(m.sideM, 0, null);
const arrowBounds = arrowBoundsReport(arrowBuffer);

console.log(
  JSON.stringify(
    {
      vicmapCalls,
      buildCityGroupMs: Math.round(buildMs * 100) / 100,
      hasSiteBoundaryMesh: Boolean(boundary),
      sitePlanHasWindLayer: windLayer,
      uniformWhite,
      siteBoundaryDash: dash,
      arrowBounds,
      arrowCount: arrowBuffer.curves.length,
    },
    null,
    2,
  ),
);

if (vicmapCalls !== 1) process.exitCode = 1;
if (!arrowBounds.insideFrame || !arrowBounds.aboveTerrain) process.exitCode = 1;
if (windLayer) process.exitCode = 1;
