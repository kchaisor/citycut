/**
 * QA: smooth fillets and centreline bends — main vs PR crops.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync, cpSync } from "node:fs";
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

function copyPlan(label, dest) {
  cpSync(`${outDir}/footpath-fillet-plan-${label}.png`, `${outDir}/${dest}`);
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

execSync(`npx vite-node scripts/find-kelvin-fitzroy-crop.mjs ${modelPath}`, { stdio: "inherit" });
execSync(`npx vite-node scripts/find-bend-crop.mjs ${modelPath}`, { stdio: "inherit" });

const junctionWide = readFileSync(`${outDir}/kelvin-fitzroy-wide.txt`, "utf8").trim();
const junctionClose = readFileSync(`${outDir}/kelvin-fitzroy-closeup.txt`, "utf8").trim();
const bendViewBox = readFileSync(`${outDir}/bend-viewbox.txt`, "utf8").trim();
console.log({ junctionWide, junctionClose, bendViewBox });

execSync("git stash push -u -m qa-smooth-main --quiet || true");
execSync("git checkout main --quiet");
renderCrop("junction-wide-main", junctionWide, 2);
renderCrop("junction-closeup-main", junctionClose, 2);
renderCrop("bend-main", bendViewBox, 2);
execSync(`git checkout ${branch} --quiet`);
execSync("git stash pop --quiet || true");

renderCrop("junction-wide-pr", junctionWide, 2);
renderCrop("junction-closeup-pr", junctionClose, 2);
renderCrop("bend-pr", bendViewBox, 2);

copyPlan("junction-wide-main", "smooth-junction-wide-main.png");
copyPlan("junction-wide-pr", "smooth-junction-wide-pr.png");
copyPlan("junction-closeup-main", "smooth-junction-closeup-main.png");
copyPlan("junction-closeup-pr", "smooth-junction-closeup-pr.png");
copyPlan("bend-main", "smooth-bend-main.png");
copyPlan("bend-pr", "smooth-bend-pr.png");

execSync(`npx vite-node scripts/centreline-smooth-stats.mjs ${modelPath} pr`, { stdio: "inherit" });
execSync(`npx vite-node scripts/bench-plan-1km.mjs ${modelPath} smooth-pr`, { stdio: "inherit" });
execSync("git checkout main --quiet");
execSync(`npx vite-node scripts/bench-plan-1km.mjs ${modelPath} smooth-main`, { stdio: "inherit" });
execSync(`git checkout ${branch} --quiet`);

console.log("QA complete", outDir);
