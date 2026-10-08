import { readFileSync } from "node:fs";
import { smoothCentrelineDetailed, junctionPointsFromStrips } from "../src/lib/centrelineSmooth.ts";
import { footpathStrips, stitchFootpathStrips, PATH_OUTPUT_SIMPLIFY_M } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/east-model.json", "utf8"));
const strips = stitchFootpathStrips(footpathStrips(model.roads, PATH_WIDTH_M));
const junctions = junctionPointsFromStrips(strips);
const box = { x: -70, y: 72, w: 78, h: 78 };

for (const cap of [0.5, 0.75, 1.0, 1.5]) {
  for (const iterations of [1, 2]) {
    const acc = {};
    for (const strip of strips) {
      const inBox = strip.line.some(
        (p) => p[0] >= box.x && p[0] <= box.x + box.w && p[1] >= box.y && p[1] <= box.y + box.h,
      );
      if (!inBox) continue;
      const { outcome } = smoothCentrelineDetailed(strip.line, {
        junctionPoints: junctions,
        simplifyM: PATH_OUTPUT_SIMPLIFY_M,
        maxLateralShiftM: cap,
        iterations,
      });
      acc[outcome] = (acc[outcome] ?? 0) + 1;
    }
    console.log("cap", cap, "iter", iterations, acc);
  }
}
