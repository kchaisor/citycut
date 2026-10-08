import { readFileSync } from "node:fs";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { signedArea, openRing } from "../src/lib/geo.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/jolimont-model.json", "utf8"));
clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: false });
function inBox(e, n) {
  const svgY = -n;
  return e >= 80 && e <= 220 && svgY >= -490 && svgY <= -380;
}
for (const rings of plan.green) {
  const outer = rings[0];
  if (!outer) continue;
  const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
  const cy = outer.reduce((s, p) => s + p[1], 0) / outer.length;
  if (!inBox(cx, cy)) continue;
  const area = Math.abs(signedArea(openRing(outer)));
  console.log("green", { cx, cy, area });
}
