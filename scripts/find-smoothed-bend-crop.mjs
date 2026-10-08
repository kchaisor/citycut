import { readFileSync, writeFileSync } from "node:fs";
import { smoothCentrelineDetailed, junctionPointsFromStrips } from "../src/lib/centrelineSmooth.ts";
import { footpathStrips, stitchFootpathStrips, PATH_OUTPUT_SIMPLIFY_M } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/east-model.json", "utf8"));
const strips = stitchFootpathStrips(footpathStrips(model.roads, PATH_WIDTH_M));
const junctions = junctionPointsFromStrips(strips);

let best = null;
for (const strip of strips) {
  const { outcome, line } = smoothCentrelineDetailed(strip.line, {
    junctionPoints: junctions,
    simplifyM: PATH_OUTPUT_SIMPLIFY_M,
  });
  if (outcome !== "smoothed" || line.length <= strip.line.length) continue;
  let cx = 0;
  let cy = 0;
  for (const p of strip.line) {
    cx += p[0];
    cy += p[1];
  }
  cx /= strip.line.length;
  cy /= strip.line.length;
  const inFitzroy = cx >= -70 && cx <= 8 && cy >= 72 && cy <= 150;
  const score = (line.length - strip.line.length) * strip.line.length * (inFitzroy ? 20 : 1);
  if (!best || score > best.score) best = { cx, cy, score, orig: strip.line.length, smooth: line.length, inFitzroy };
}

const size = 28;
const vb = best
  ? `${Math.round(best.cx - size / 2)} ${Math.round(best.cy - size / 2)} ${size} ${size}`
  : "-78 78 35 35";
writeFileSync("/opt/cursor/artifacts/bend-viewbox.txt", vb);
console.log(JSON.stringify({ best, vb }));
