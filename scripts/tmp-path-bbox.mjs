import { readFileSync } from "node:fs";
import { footpathLines, isVehicularRoad } from "../src/lib/roadFill.ts";

const m = JSON.parse(readFileSync("/opt/cursor/artifacts/east-model.json", "utf8"));
const paths = footpathLines(m.roads);
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
for (const l of paths) {
  for (const p of l) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
}
console.log("path bbox", minX, minY, maxX, maxY);

for (const box of [
  [40, 80, 95, 135],
  [-20, 30, 95, 135],
  [-80, 0, 75, 155],
]) {
  const near = paths.flatMap((l) => l).filter((p) => p[0] > box[0] && p[0] < box[1] && p[1] > box[2] && p[1] < box[3]);
  console.log("box", box, "points", near.length);
}
