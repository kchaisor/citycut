import { readFileSync, writeFileSync } from "node:fs";
import { footpathLines, isVehicularRoad } from "../src/lib/roadFill.ts";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/east-model.json", "utf8"));

function segIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const ab = cross(a, b, c) * cross(a, b, d);
  const cd = cross(c, d, a) * cross(c, d, b);
  return ab < 0 && cd < 0;
}

const paths = footpathLines(model.roads);
const crossings = [];
for (let i = 0; i < paths.length; i++) {
  for (let j = i + 1; j < paths.length; j++) {
    const a = paths[i];
    const b = paths[j];
    for (let ai = 0; ai < a.length - 1; ai++) {
      for (let bi = 0; bi < b.length - 1; bi++) {
        if (segIntersect(a[ai], a[ai + 1], b[bi], b[bi + 1])) {
          const mx = (a[ai][0] + a[ai + 1][0] + b[bi][0] + b[bi + 1][0]) / 4;
          const my = (a[ai][1] + a[ai + 1][1] + b[bi][1] + b[bi + 1][1]) / 4;
          crossings.push([mx, my]);
        }
      }
    }
  }
}

const box = { x: -70, y: 70, w: 90, h: 90 };
const inBox = ([x, y]) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
const local = crossings.filter(inBox);
console.log("crossings in fitzroy box", local);

const roads = model.roads.filter(isVehicularRoad);
let roadEast = 0;
for (const road of roads) {
  for (let i = 0; i < road.line.length - 1; i++) {
    const mx = (road.line[i][0] + road.line[i + 1][0]) / 2;
    const my = (road.line[i][1] + road.line[i + 1][1]) / 2;
    if (mx > 5 && mx < 25 && my > 70 && my < 160) roadEast++;
  }
}
console.log("road segments east edge", roadEast);

const wide = "-68 72 78 78";
const close =
  local.length > 0
    ? `${Math.round(local[0][0] - 5)} ${Math.round(local[0][1] - 5)} 10 10`
    : "-32 102 10 10";

writeFileSync("/opt/cursor/artifacts/kelvin-fitzroy-wide.txt", wide);
writeFileSync("/opt/cursor/artifacts/kelvin-fitzroy-closeup.txt", close);
console.log(JSON.stringify({ wide, close, crossings: local.length }));
