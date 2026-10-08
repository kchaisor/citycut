/**
 * QA: smooth fillets and centreline bends — main vs PR crops.
 * npm run build && npm run preview (or use vite-node renders only)
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const outDir = "/opt/cursor/artifacts";
const modelPath = "/opt/cursor/artifacts/east-model.json";
const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();

function renderCrop(label, viewBox, fillet = 2) {
  execSync(
    `npx vite-node scripts/render-site-plan-crop.mjs ${modelPath} ${label} "${viewBox}" ${fillet}`,
    { stdio: "inherit" },
  );
}

async function captureModel() {
  if (existsSync(modelPath)) return;
  const base = "http://127.0.0.1:4173/citycut/";
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${base}?qa=1&lat=-37.8136&lon=144.9831&km=1`, {
    waitUntil: "networkidle",
    timeout: 180_000,
  });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForFunction(
    () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 20,
    null,
    { timeout: 600_000 },
  );
  const snapshot = await page.evaluate(() => window.__citycutQaModel?.exportPlanSnapshot?.() ?? null);
  if (snapshot) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(modelPath, JSON.stringify(snapshot));
  }
  await browser.close();
}

if (!existsSync(modelPath)) {
  console.log("Capturing east-model.json via preview…");
  execSync("npm run build", { stdio: "inherit" });
  execSync(
    'SESSION_NAME="vite-preview-qa-smooth"; tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "/workspace" -- "${SHELL:-zsh}" -l; tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" "npm run preview -- --host 127.0.0.1 --port 4173" C-m',
    { shell: "/bin/bash", stdio: "inherit" },
  );
  execSync(
    'for i in $(seq 1 20); do curl -sf http://127.0.0.1:4173/citycut/ >/dev/null && exit 0; sleep 2; done; exit 1',
    { shell: "/bin/bash" },
  );
  await captureModel();
}

const kelvinViewBoxFile = `${outDir}/kelvin-fitzroy-viewbox.txt`;
execSync(`npx vite-node scripts/find-kelvin-fitzroy-crop.mjs ${modelPath}`, { stdio: "inherit" });
const kelvinViewBox = readFileSync(kelvinViewBoxFile, "utf8").trim();
console.log("Kelvin viewBox", kelvinViewBox);

const bendViewBox = "55 75 70 70";

// Main baseline (parent commit on main before this branch)
execSync("git stash push -u -m qa-smooth-main --quiet || true");
execSync("git checkout main --quiet");
renderCrop("kelvin-junction-main", kelvinViewBox, 2);
renderCrop("road-bend-main", bendViewBox, 2);
renderCrop("fitzroy-fillet-main", "-65 75 80 80", 2);
execSync(`git checkout ${branch} --quiet`);
execSync("git stash pop --quiet || true");

renderCrop("kelvin-junction-pr", kelvinViewBox, 2);
renderCrop("road-bend-pr", bendViewBox, 2);
renderCrop("fitzroy-fillet-pr", "-65 75 80 80", 2);

execSync(`cp ${outDir}/footpath-fillet-plan-kelvin-junction-main.png ${outDir}/smooth-kelvin-junction-main.png`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-kelvin-junction-pr.png ${outDir}/smooth-kelvin-junction-pr.png`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-road-bend-main.png ${outDir}/smooth-road-bend-main.png`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-road-bend-pr.png ${outDir}/smooth-road-bend-pr.png`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-fitzroy-fillet-main.png ${outDir}/smooth-fitzroy-fillet-main.png`, {
  stdio: "inherit",
});
execSync(`cp ${outDir}/footpath-fillet-plan-fitzroy-fillet-pr.png ${outDir}/smooth-fitzroy-fillet-pr.png`, {
  stdio: "inherit",
});

execSync(`npx vite-node scripts/bench-plan-1km.mjs ${modelPath} smooth-pr`, { stdio: "inherit" });
execSync("git checkout main --quiet");
execSync(`npx vite-node scripts/bench-plan-1km.mjs ${modelPath} smooth-main`, { stdio: "inherit" });
execSync(`git checkout ${branch} --quiet`);

console.log("QA complete", outDir);
