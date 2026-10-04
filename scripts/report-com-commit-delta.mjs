/**
 * Buildings for Kelvin review: clip (0a8b37a logic) vs d835ce1 legacy fast vs bidirectional fix.
 */
import {
  applyComBuildingHeightsClipOnly,
  applyComBuildingHeightsLegacyOsmOnlyFastPath,
  applyComBuildingHeights,
  clearComBuildingFootprintCache,
  fetchComBuildingFootprints,
  paddedComFetchBounds,
  tallestExtrusionHeight,
  classifyComHeightApplicationLegacy,
  classifyComHeightApplication,
} from "../src/lib/comBuildingHeights.ts";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureBuildingsForCut } from "../src/lib/overtureBuildings.ts";

const center = { lon: 144.9631, lat: -37.8136 };
const sideM = 1000;
const bounds = paddedComFetchBounds(center, sideM);
const cutBounds = squareBBox({ lon: center.lon, lat: center.lat, zoom: 15 }, sideM);
const { buildings } = await fetchOvertureBuildingsForCut(cutBounds, center, sideM);
const parsed = { buildings };
const wayTags = new Map();
clearComBuildingFootprintCache();
const fp = await fetchComBuildingFootprints(bounds, center);
const clip = applyComBuildingHeightsClipOnly(parsed.buildings, fp);
const leg = applyComBuildingHeightsLegacyOsmOnlyFastPath(parsed.buildings, fp);
const fixed = applyComBuildingHeights(parsed.buildings, fp);

const rows = [];
for (let i = 0; i < parsed.buildings.length; i++) {
  const osmH = parsed.buildings[i].height;
  const hClip = tallestExtrusionHeight(clip.buildings[i]);
  const hLeg = tallestExtrusionHeight(leg.buildings[i]);
  const hFix = tallestExtrusionHeight(fixed.buildings[i]);
  const maxDelta = Math.max(Math.abs(hLeg - hClip), Math.abs(hFix - hClip));
  const legacyDetail = classifyComHeightApplicationLegacy(parsed.buildings[i], fp);
  const fixedDetail = classifyComHeightApplication(parsed.buildings[i], fp);
  const slabRisk =
    legacyDetail.path === "fast" &&
    (legacyDetail.comCoveragePct ?? 100) < 80 &&
    !leg.buildings[i].extrusionParts &&
    hLeg - osmH > 20;
  if (maxDelta <= 20 && !slabRisk && fixedDetail.path === legacyDetail.path) continue;
  const tags = wayTags.get(parsed.buildings[i].id) ?? {};
  rows.push({
    osmId: parsed.buildings[i].id,
    label: tags.name || tags.building || parsed.buildings[i].use,
    height0a8b37aClip: Math.round(hClip * 10) / 10,
    heightD835ce1LegacyFast: Math.round(hLeg * 10) / 10,
    heightAfterBidirectionalFix: Math.round(hFix * 10) / 10,
    pathD835ce1: legacyDetail.path,
    pathAfterFix: fixedDetail.path,
    comPartIds: [...new Set(legacyDetail.comPartIds)],
    osmCoveragePct: legacyDetail.osmCoveragePct,
    comCoveragePct: legacyDetail.comCoveragePct,
    slabWholeFootprintRisk: slabRisk,
  });
}
rows.sort(
  (a, b) =>
    (b.slabWholeFootprintRisk ? 1 : 0) - (a.slabWholeFootprintRisk ? 1 : 0) ||
    Math.abs(b.heightD835ce1LegacyFast - b.height0a8b37aClip) -
      Math.abs(a.heightD835ce1LegacyFast - a.height0a8b37aClip),
);
console.log(JSON.stringify({ count: rows.length, rows }, null, 2));
