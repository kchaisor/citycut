/**
 * Scan viewBox grid for max pathFill raster diff between main lib and PR lib.
 */
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { PNG } from "pngjs";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
const modelPath = "/opt/cursor/artifacts/east-model.json";
const mainLibFiles = ["src/lib/polygonOffset.ts", "src/lib/roadFill.ts"];

function checkoutMainLib() {
  execSync(`git checkout main -- ${mainLibFiles.join(" ")}`, { cwd: "/workspace" });
  rmSync("/workspace/src/lib/centrelineSmooth.ts", { force: true });
}
function restoreBranchLib() {
  execSync(`git checkout ${branch} -- ${mainLibFiles.join(" ")} src/lib/centrelineSmooth.ts`, { cwd: "/workspace" });
}
function render(label, vb) {
  execSync(
    `npx vite-node scripts/render-site-plan-crop.mjs ${modelPath} ${label} "${vb}" 2`,
    { stdio: "pipe", cwd: "/workspace" },
  );
}
function diffPx(aPath, bPath) {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    if (d) changed++;
  }
  return changed;
}

const out = "/opt/cursor/artifacts";
let best = { changed: 0, vb: "" };
for (let y = 70; y <= 140; y += 14) {
  for (let x = -70; x <= 10; x += 14) {
    const vb = `${x} ${y} 28 28`;
    checkoutMainLib();
    render("scan-main", vb);
    restoreBranchLib();
    render("scan-pr", vb);
    const changed = diffPx(`${out}/footpath-fillet-plan-scan-main.png`, `${out}/footpath-fillet-plan-scan-pr.png`);
    if (changed > best.changed) best = { changed, vb };
    console.log(vb, changed);
  }
}
console.log("best", best);
