/**
 * Write landmark-computed.json from committed snapshot + fixture (no network).
 *   npx vite-node scripts/write-landmark-computed-sidecar.mjs
 */
import { writeFileSync, readFileSync } from "node:fs";
import landmarks from "../src/lib/fixtures/landmark-heights.json" assert { type: "json" };
import { resolveLandmarkCut } from "../src/lib/landmarkHeightPipeline.ts";
import { loadLandmarkOsmWays, pickLandmarkBuildingAtPoint } from "../src/lib/landmarkOsmVerify.ts";

const snapshot = JSON.parse(readFileSync("src/lib/fixtures/landmark-heights-snapshot.json", "utf8"));
const osmWays = JSON.parse(readFileSync("src/lib/fixtures/landmark-osm-ways.json", "utf8"));
const byCut = new Map(snapshot.cuts.map((c) => [c.name, c]));
const computed = {};
for (const lm of landmarks) {
  const cut = byCut.get(lm.cut);
  if (!cut) throw new Error(`missing cut ${lm.cut}`);
  const final = resolveLandmarkCut(cut);
  const pick = pickLandmarkBuildingAtPoint(final, lm, cut.center, osmWays);
  if (!pick) throw new Error(`no pick for ${lm.name}`);
  computed[lm.name] = Math.round(pick.heightM * 10) / 10;
}
writeFileSync(
  "src/lib/fixtures/landmark-computed.json",
  `${JSON.stringify({ generatedAt: new Date().toISOString(), computed }, null, 2)}\n`,
);
console.info(JSON.stringify(computed, null, 2));
