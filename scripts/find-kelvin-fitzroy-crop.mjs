/**
 * Score viewBox crops for Kelvin's Fitzroy junction (road on east edge of frame).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { clearFootpathUnionCacheForTests, footpathStrips, unionFootpathStrips } from "../src/lib/roadFill.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/east-model.json";
const model = JSON.parse(readFileSync(modelPath, "utf8"));

function inView(x, y, vb) {
  return x >= vb.x && x <= vb.x + vb.w && y >= vb.y && y <= vb.y + vb.h;
}

clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });

let best = { score: -1, vb: "35 105 28 28" };
for (let x = 20; x <= 55; x += 2) {
  for (let y = 90; y <= 120; y += 2) {
    for (const w of [26, 28, 30]) {
      const vb = { x, y, w, h: w };
      let pathPts = 0;
      let roadEast = 0;
      for (const polygon of plan.pathFill) {
        for (const ring of polygon) {
          for (const [px, py] of ring) {
            if (inView(px, py, vb)) pathPts++;
          }
        }
      }
      for (const polygon of plan.roadFill) {
        for (const ring of polygon) {
          for (const [px, py] of ring) {
            if (inView(px, py, vb) && px > vb.x + vb.w * 0.75) roadEast++;
          }
        }
      }
      const score = pathPts * 0.001 + roadEast;
      if (score > best.score && roadEast > 5 && pathPts > 50) best = { score, vb: `${x} ${y} ${w} ${w}` };
    }
  }
}

writeFileSync("/opt/cursor/artifacts/kelvin-fitzroy-viewbox.txt", best.vb);
console.log(JSON.stringify(best));
