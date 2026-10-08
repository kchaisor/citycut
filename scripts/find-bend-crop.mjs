import { readFileSync, writeFileSync } from "node:fs";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/east-model.json", "utf8"));

function wrap(d) {
  let v = d % (2 * Math.PI);
  if (v <= -Math.PI) v += 2 * Math.PI;
  if (v > Math.PI) v -= 2 * Math.PI;
  return v;
}
function turnDef(a, b, c) {
  const inA = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const outA = Math.atan2(c[1] - b[1], c[0] - b[0]);
  return (Math.abs(wrap(outA - inA)) * 180) / Math.PI;
}

const paths = model.roads.filter((r) => r.grade === "path" && r.kind !== "rail");
const roads = model.roads.filter((r) => r.grade !== "path" && r.kind !== "rail" && r.width > 4);

function scoreLine(line) {
  let score = 0;
  let maxTurn = 0;
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (let i = 1; i < line.length - 1; i++) {
    const t = turnDef(line[i - 1], line[i], line[i + 1]);
    if (t >= 6) {
      score += t;
      maxTurn = Math.max(maxTurn, t);
      cx += line[i][0];
      cy += line[i][1];
      n++;
    }
  }
  if (n < 2 || line.length < 5) return null;
  return { score, maxTurn, mx: cx / n, my: cy / n, len: line.length, facetScore: score * line.length };
}

const boxes = [
  { name: "fitzroy", x: -70, y: 85, w: 80, h: 75 },
  { name: "treasury", x: -120, y: 40, w: 60, h: 60 },
  { name: "wellington", x: 20, y: 60, w: 80, h: 80 },
];

let best = null;
for (const box of boxes) {
  for (const r of [...paths, ...roads]) {
    const s = scoreLine(r.line);
    if (!s) continue;
    const { mx, my } = s;
    if (mx < box.x || mx > box.x + box.w || my < box.y || my > box.y + box.h) continue;
    const entry = { ...s, box: box.name, grade: r.grade };
    if (!best || entry.facetScore > best.facetScore) best = entry;
  }
}

const size = 35;
const vb = best
  ? `${Math.round(best.mx - size / 2)} ${Math.round(best.my - size / 2)} ${size} ${size}`
  : "-40 110 35 35";
writeFileSync("/opt/cursor/artifacts/bend-viewbox.txt", vb);
console.log(JSON.stringify({ best, vb }));
