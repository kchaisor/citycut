import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
const paths = [
  `${outDir}/b5-footpath-junction-before.png`,
  `${outDir}/b5-footpath-junction-after.png`,
  `${outDir}/b5-footpath-junction-fixture-after.png`,
];
const images = paths.map((p) => PNG.sync.read(readFileSync(p)));
const height = Math.max(...images.map((i) => i.height));
const gap = 8;
const width = images.reduce((sum, img) => sum + img.width + gap, -gap);
const out = new PNG({ width, height });
out.data.fill(0xf5, 0xf5, 0xf5, 255);
let x = 0;
for (const img of images) {
  PNG.bitblt(img, out, 0, 0, img.width, img.height, x, 0);
  x += img.width + gap;
}
writeFileSync(`${outDir}/b5-footpath-junction-compare.png`, PNG.sync.write(out));
console.log("Wrote compare");
