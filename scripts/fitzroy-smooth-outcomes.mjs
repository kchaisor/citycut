import { readFileSync } from "node:fs";
import { smoothCentrelineDetailed, junctionPointsFromStrips } from "../src/lib/centrelineSmooth.ts";
import { footpathStrips, stitchFootpathStrips, PATH_OUTPUT_SIMPLIFY_M } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/east-model.json", "utf8"));
const strips = stitchFootpathStrips(footpathStrips(model.roads, PATH_WIDTH_M));
const junctions = junctionPointsFromStrips(strips);
const box = { x: -70, y: 72, w: 78, h: 78 };

const rows = [];
for (const strip of strips) {
  const inBox = strip.line.some(
    (p) => p[0] >= box.x && p[0] <= box.x + box.w && p[1] >= box.y && p[1] <= box.y + box.h,
  );
  if (!inBox) continue;
  let cx = 0;
  let cy = 0;
  for (const p of strip.line) {
    cx += p[0];
    cy += p[1];
  }
  cx /= strip.line.length;
  cy /= strip.line.length;
  const { outcome } = smoothCentrelineDetailed(strip.line, {
    junctionPoints: junctions,
    simplifyM: PATH_OUTPUT_SIMPLIFY_M,
  });
  rows.push({ outcome, len: strip.line.length, cx: +cx.toFixed(1), cy: +cy.toFixed(1) });
}
console.log(JSON.stringify(rows.reduce((acc, r) => { acc[r.outcome]=(acc[r.outcome]||0)+1; return acc; }, {})));
console.log(rows.filter((r) => r.outcome === "smoothed").slice(0, 10));
