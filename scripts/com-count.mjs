import { countBuildingsWithComDerivedExtrusion, fetchComBuildingFootprintsWithStats, paddedComFetchBounds } from "../src/lib/comBuildingHeights.ts";
import { runComBuildingHeightsInWorker } from "../src/lib/comBuildingHeightsWorkerClient.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const bounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const { buildings } = await fetchOvertureBuildingsForCut(bounds, center, sideM);
const { footprints } = await fetchComBuildingFootprintsWithStats(paddedComFetchBounds(center, sideM), center);
const { buildings: after } = await runComBuildingHeightsInWorker(buildings, footprints);
console.log(JSON.stringify({ buildings: buildings.length, comUpdated: countBuildingsWithComDerivedExtrusion(buildings, after) }));
