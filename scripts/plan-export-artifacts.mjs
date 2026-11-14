#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { sitePlanAi, sitePlanSvg } from "../src/lib/aiPlan.ts";
import { model } from "../src/lib/aiExport.test.ts";
import { planShadowRings } from "../src/lib/buildingShadows.ts";
import { SUN_STUDY_HOURS } from "../src/lib/sunStudyPlan.ts";

const outDir = "/opt/cursor/artifacts";
const at = { lat: -37.8045, lon: 145.1065 };
const date = { ...at, year: 2026, month: 9, day: 22 };
const layers = SUN_STUDY_HOURS.map((hour) => ({
  hour,
  rings: [...planShadowRings(model(), { ...date, hour, minute: 0 }, true)],
}));
const options = {
  heliodon: { ...date, hour: 12, minute: 0, sideM: model().sideM, radiusFactor: 1.75 },
  shadows: { ...date, hour: 12, minute: 0 },
  castShadows: false,
  sunStudy: { layers },
  sunStudyDate: date,
};
const scale = 2500;
const m = model();

fs.mkdirSync(outDir, { recursive: true });

const svg = await sitePlanSvg(m, scale, undefined, options);
const ai = await sitePlanAi(m, scale, undefined, options);
fs.writeFileSync(path.join(outDir, "site-plan-export.svg"), svg);
fs.writeFileSync(path.join(outDir, "site-plan-export.ai"), ai);

async function rasterSvg(svgText, dest, width = 1400) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height: width } });
  await page.setContent(
  `<!doctype html><style>html,body{margin:0;background:#e7e6e6}svg{display:block;width:100%;height:auto}</style>${svgText}`,
    { waitUntil: "load" },
  );
  await page.screenshot({ path: dest });
  await browser.close();
}

function pngDiff(aPath, bPath, dest) {
  const a = PNG.sync.read(fs.readFileSync(aPath));
  const b = PNG.sync.read(fs.readFileSync(bPath));
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  let diff = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const d = dr + dg + db > 48;
      if (d) diff++;
      out.data[i] = d ? 255 : a.data[i];
      out.data[i + 1] = d ? 0 : a.data[i + 1];
      out.data[i + 2] = d ? 0 : a.data[i + 2];
      out.data[i + 3] = 255;
    }
  }
  fs.writeFileSync(dest, PNG.sync.write(out));
  return diff / (w * h);
}

await rasterSvg(svg, path.join(outDir, "site-plan-export-svg.png"));

const pdfToCairo = "pdftocairo";
try {
  const aiPath = path.join(outDir, "site-plan-export.ai");
  const pngPath = path.join(outDir, "site-plan-export-ai.png");
  const { execFileSync } = await import("node:child_process");
  execFileSync(pdfToCairo, ["-png", "-singlefile", aiPath, path.join(outDir, "site-plan-export-ai")], { stdio: "ignore" });
  if (fs.existsSync(pngPath)) {
    const ratio = pngDiff(path.join(outDir, "site-plan-export-svg.png"), pngPath, path.join(outDir, "export-svg-ai-diff.png"));
    console.log("svg vs ai raster diff ratio", ratio.toFixed(4));
  }
} catch {
  console.warn("pdftocairo unavailable; skipped .ai raster");
}

console.log("Wrote export artifacts to", outDir);
