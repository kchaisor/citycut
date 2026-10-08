/**
 * Kelvin PR #66 QA: facet, kerb, road-gaps, path-kink (main vs PR, real site plan UI).
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";
const lat = -37.8127;
const lon = 144.98061;
const km = 1;
const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
const mainLib = ["src/lib/polygonOffset.ts", "src/lib/roadFill.ts"];
const prOnlyLib = ["src/lib/roadSurfacePlan.ts", "src/lib/centrelineUnionPrep.ts"];

function loadCrops() {
  const cropFile = `${outDir}/kelvin-jolimont-crops.json`;
  if (existsSync(cropFile)) {
    const j = JSON.parse(readFileSync(cropFile, "utf8"));
    return {
      "facet-spot": j.facetSpot,
      "kerb-return": j.kerbReturn,
      "road-gaps": j.roadGaps,
      "path-kink": j.pathKink,
    };
  }
  return {
    "facet-spot": "120 180 55 55",
    "kerb-return": "145 195 12 12",
    "road-gaps": "130 175 45 40",
    "path-kink": "95 210 18 18",
  };
}
let crops = loadCrops();

function checkoutMainLib() {
  execSync(`git checkout main -- ${mainLib.join(" ")}`, { cwd: "/workspace" });
  for (const f of prOnlyLib) {
    try {
      execSync(`git rm -f --cached ${f} 2>/dev/null; rm -f /workspace/${f}`, { cwd: "/workspace", shell: "/bin/bash" });
    } catch {
      /* already absent */
    }
  }
  for (const f of [
    "src/lib/centrelineSmooth.ts",
    "src/lib/svgPlan.ts",
    "src/components/DrawingPlan.tsx",
    "src/lib/aiPlan.ts",
  ]) {
    try {
      execSync(`git checkout main -- ${f}`, { cwd: "/workspace" });
    } catch {
      execSync(`rm -f /workspace/${f}`, { cwd: "/workspace" });
    }
  }
}

function restoreBranch() {
  execSync(`git checkout ${branch} -- .`, { cwd: "/workspace" });
}

async function captureModel() {
  const modelPath = `${outDir}/jolimont-model.json`;
  if (existsSync(modelPath)) return modelPath;
  execSync("npm run build", { cwd: "/workspace", stdio: "inherit" });
  execSync(
    'SESSION_NAME="vite-preview-kelvin"; tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "/workspace" -- "${SHELL:-zsh}" -l; tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" "npm run preview -- --host 127.0.0.1 --port 4173" C-m',
    { shell: "/bin/bash" },
  );
  execSync('for i in $(seq 1 30); do curl -sf http://127.0.0.1:4173/citycut/ >/dev/null && exit 0; sleep 2; done; exit 1', {
    shell: "/bin/bash",
  });
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${base}?qa=1&lat=${lat}&lon=${lon}&km=${km}`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForFunction(
    () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 100,
    null,
    { timeout: 600_000 },
  );
  const snapshot = await page.evaluate(() => window.__citycutQaModel?.exportPlanSnapshot?.() ?? null);
  if (snapshot) writeFileSync(modelPath, JSON.stringify(snapshot));
  await browser.close();
  execSync(`npx vite-node scripts/find-kelvin-jolimont-crops.mjs ${modelPath}`, { cwd: "/workspace", stdio: "inherit" });
  crops = loadCrops();
  return modelPath;
}

async function shotSitePlan(page, viewBox, dest) {
  await page.locator(".icon-rail").getByRole("button", { name: "Drawing", exact: true }).click();
  await page.waitForTimeout(200);
  const sitePlanBtn = page.getByRole("button", { name: "Site plan", exact: true });
  if ((await sitePlanBtn.getAttribute("aria-pressed")) !== "true") await sitePlanBtn.click();
  await page.waitForSelector(".fill.is-plan svg.plan:not(.figure-ground)", { timeout: 120_000 });
  await page.getByLabel("Plan scale", { exact: true }).selectOption("500");
  await page.waitForTimeout(400);
  await page.addStyleTag({
    content: ".model-chrome .icon-rail, .model-chrome .drawer { visibility: hidden !important; }",
  });
  await page.evaluate((vb) => {
    const svg = document.querySelector(".fill.is-plan svg.plan");
    if (svg) svg.setAttribute("viewBox", vb);
  }, viewBox);
  await page.locator(".fill.is-plan").screenshot({ path: dest });
}

async function runVariant(label, buildFirst) {
  if (buildFirst) execSync("npm run build", { cwd: "/workspace", stdio: "inherit" });
  execSync(
    'SESSION_NAME="vite-preview-kelvin"; tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null || tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "/workspace" -- "${SHELL:-zsh}" -l; tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" "npm run preview -- --host 127.0.0.1 --port 4173" C-m',
    { shell: "/bin/bash" },
  );
  execSync('for i in $(seq 1 30); do curl -sf http://127.0.0.1:4173/citycut/ >/dev/null && exit 0; sleep 2; done; exit 1', {
    shell: "/bin/bash",
  });
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(`${base}?qa=1&lat=${lat}&lon=${lon}&km=${km}`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForFunction(
    () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 100,
    null,
    { timeout: 600_000 },
  );
  for (const [name, vb] of Object.entries(crops)) {
    await shotSitePlan(page, vb, `${outDir}/${name}-${label}.png`);
  }
  await browser.close();
}

const modelPath = await captureModel();

checkoutMainLib();
await runVariant("main", true);
restoreBranch();
await runVariant("pr", true);

execSync(`npx vite-node scripts/bench-plan-1km.mjs ${modelPath} jolimont-pr`, { stdio: "inherit", cwd: "/workspace" });
checkoutMainLib();
execSync(`npx vite-node scripts/bench-plan-1km.mjs ${modelPath} jolimont-main`, { stdio: "inherit", cwd: "/workspace" });
restoreBranch();
const eastPath = `${outDir}/east-model.json`;
if (existsSync(eastPath)) {
  execSync(`npx vite-node scripts/bench-plan-1km.mjs ${eastPath} east-pr`, { stdio: "inherit", cwd: "/workspace" });
  checkoutMainLib();
  execSync(`npx vite-node scripts/bench-plan-1km.mjs ${eastPath} east-main`, { stdio: "inherit", cwd: "/workspace" });
  restoreBranch();
}

console.log("Kelvin PR66 QA written to", outDir);
