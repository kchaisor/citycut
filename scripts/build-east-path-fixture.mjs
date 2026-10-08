import { readFileSync, writeFileSync } from "node:fs";

const src = JSON.parse(readFileSync("/opt/cursor/artifacts/east-model.json", "utf8"));
const minX = -120;
const maxX = 420;
const minY = -80;
const maxY = 320;

function touchesBox(line) {
  for (const [x, y] of line) {
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) return true;
  }
  return false;
}

function clipRing(ring) {
  return touchesBox(ring) ? ring : null;
}

const out = {
  ...src,
  placeLabel: "East Melbourne path trim (QA fixture)",
  roads: src.roads.filter((r) => touchesBox(r.line)),
  buildings: src.buildings.filter((b) => touchesBox(b.ring)),
  areas: src.areas.filter((a) => touchesBox(a.ring)),
  tramLines: (src.tramLines ?? []).filter((line) => touchesBox(line)),
  trees: (src.trees ?? []).filter((t) => t.at[0] >= minX && t.at[0] <= maxX && t.at[1] >= minY && t.at[1] <= maxY),
};

writeFileSync("src/lib/fixtures/east-melbourne-path-trim.json", JSON.stringify(out));
console.log("roads", out.roads.length, "bytes", JSON.stringify(out).length);
