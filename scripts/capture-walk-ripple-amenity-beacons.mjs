import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
const NODE_OVERPASS_FALLBACKS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

async function nodeOverpassPost(query) {
  for (const url of NODE_OVERPASS_FALLBACKS) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent": "CityCut/1.0 (+https://kchaisor.github.io/citycut/)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(50_000),
      });
      if (response.status === 429 || response.status < 200 || response.status >= 300) continue;
      const body = await response.text();
      if (!body.trimStart().startsWith("{")) continue;
      return { status: response.status, body };
    } catch {
      continue;
    }
  }
  return null;
}

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const KM = 1;
const SHOT_WIDE = `${outDir}/walk-ripple-amenity-beacons-box-hill-1440x900.png`;
const SHOT_CARD = `${outDir}/walk-ripple-amenity-beacons-card-closeup.png`;
const CLIP = `${outDir}/walk-ripple-amenity-beacons-box-hill-10s.mp4`;
const VIDEO_TMP = `${outDir}/walk-ripple-beacon-video-tmp`;

const boxHillQuery = `qa=1&buildings=uniform&lat=-37.8192&lon=145.1233&km=${KM}&label=Box%20Hill%20VIC`;
const baseUrl =
  process.env.CITYCUT_PREVIEW_URL ??
  `https://citycut-git-feat-walk-ripple-amenity-beacons-kchai.vercel.app/?${boxHillQuery}`;

function cameraPose45(sideM) {
  const back = sideM * 0.62;
  const eyeY = sideM * 0.48;
  const target = { x: 0, y: 6, z: 0 };
  const scale = eyeY / Math.tan((45 * Math.PI) / 180);
  const h = scale / (back * Math.SQRT2);
  return {
    eye: {
      x: target.x - back * 0.707106 * h,
      y: eyeY,
      z: target.z - back * 0.707106 * h,
    },
    target,
  };
}

async function setLayer(page, label, on) {
  const chip = page.getByRole("button", { name: label, exact: true });
  const pressed = await chip.getAttribute("aria-pressed");
  if ((pressed === "true") !== on) await chip.click();
}

async function readHudCounts(page) {
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll("[data-amenity-type][data-amenity-count]")) {
      out[el.getAttribute("data-amenity-type")] = Number(el.getAttribute("data-amenity-count"));
    }
    return out;
  });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
mkdirSync(VIDEO_TMP, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VIDEO_TMP, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(360_000);

await page.route(/overpass-api\.de|overpass\.private\.coffee|maps\.mail\.ru.*interpreter/, async (route) => {
  const post = route.request().postData() ?? "";
  if (!post.startsWith("data=")) {
    await route.continue();
    return;
  }
  const query = decodeURIComponent(post.slice(5));
  const hit = await nodeOverpassPost(query);
  if (!hit) {
    await route.abort();
    return;
  }
  await route.fulfill({
    status: hit.status,
    contentType: "application/json",
    body: hit.body,
  });
});

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector("button.create-fab", { timeout: 120_000 });
for (const [label, on] of [
  ["Buildings", true],
  ["Roads and rail", true],
  ["Water and green", true],
  ["Trees", false],
  ["Terrain", true],
  ["Contours", false],
]) {
  await setLayer(page, label, on);
}
await page.getByRole("button", { name: "Create model" }).click();
await page.waitForSelector(".model .scene-canvas", { timeout: 360_000 });
await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 120_000 });
await page.waitForFunction(
  () => document.body.classList.contains("citycut-intro-done") || !document.querySelector(".model"),
  { timeout: 120_000 },
).catch(() => {});
await page.waitForTimeout(2000);

await page.locator('.model button[data-section="analysis"]').first().click();
await page.getByRole("tab", { name: /Walk Ripple/i }).click();
await page.waitForFunction(
  () => document.querySelector('[data-walk-ripple-amenities-ready="true"]') !== null,
  { timeout: 120_000 },
);
const amenityGate = await page.evaluate(() => ({
  unavailable: Boolean(document.querySelector(".walk-ripple-amenity-unavailable")),
  pool: window.__citycutWalkRippleQa?.getAmenityPoolCount?.() ?? null,
}));
if (amenityGate.unavailable || !amenityGate.pool) {
  throw new Error(`Amenities not loaded: ${JSON.stringify(amenityGate)}`);
}

await page.getByRole("button", { name: "Pick origin", exact: true }).click();
const canvasHost = page.locator(".model .scene-canvas");
const canvas = canvasHost.locator("canvas").first();
const pickSurface = (await canvas.count()) > 0 ? canvas : canvasHost;
const box = await pickSurface.boundingBox();
if (!box) throw new Error("scene canvas missing");

await pickSurface.click({ position: { x: box.width * 0.5, y: box.height * 0.58 } });
await page.waitForTimeout(6000);
await page.evaluate(() => window.__citycutWalkRippleQa?.setMinutes(11));
await page.waitForTimeout(800);

let counts = await readHudCounts(page);
let totalReached = Object.values(counts).reduce((a, b) => a + b, 0);
if (totalReached <= 0) {
  await page.evaluate(() => window.__citycutWalkRippleQa?.setMinutes(16));
  await page.waitForTimeout(500);
  counts = await readHudCounts(page);
  totalReached = Object.values(counts).reduce((a, b) => a + b, 0);
}
if (totalReached <= 0) {
  throw new Error(`HUD amenity counts still zero: ${JSON.stringify(counts)}`);
}

const pickPoint = await page.evaluate(() => window.__citycutWalkRippleQa?.screenPointForFirstReachedAmenity?.() ?? null);
if (!pickPoint) throw new Error("No reached amenity to pick");
const canvasBox = await pickSurface.boundingBox();
if (!canvasBox) throw new Error("scene canvas missing for pick");
async function clickCanvasAt(clientX, clientY) {
  const x = clientX - canvasBox.x;
  const y = clientY - canvasBox.y;
  if (x < 0 || y < 0 || x > canvasBox.width || y > canvasBox.height) return false;
  await page.evaluate(({ cx, cy }) => {
    const target = document.querySelector(".scene-canvas canvas");
    if (!target) return;
    const init = { clientX: cx, clientY: cy, button: 0, bubbles: true, pointerId: 1, pointerType: "mouse" };
    target.dispatchEvent(new PointerEvent("pointerdown", init));
    target.dispatchEvent(new PointerEvent("pointerup", init));
  }, { cx: clientX, cy: clientY });
  await page.waitForTimeout(400);
  return page.locator(".walk-ripple-amenity-card").isVisible();
}
let cardOpen = await clickCanvasAt(pickPoint.x, pickPoint.y);
if (!cardOpen) {
  for (const [dx, dy] of [
    [6, 0],
    [-6, 0],
    [0, 6],
    [0, -6],
    [10, 10],
    [-10, 10],
  ]) {
    cardOpen = await clickCanvasAt(pickPoint.x + dx, pickPoint.y + dy);
    if (cardOpen) break;
  }
}
if (!cardOpen) {
  const probe = await page.evaluate(
    ({ x, y }) => window.__citycutWalkRipplePickProbe?.(x, y) ?? null,
    pickPoint,
  );
  throw new Error(
    `Could not open amenity card with mouse at projected beacon (probe=${JSON.stringify(probe)} point=${JSON.stringify(pickPoint)})`,
  );
}
await page.screenshot({ path: SHOT_CARD, fullPage: false });
await page.locator(".walk-ripple-amenity-card-close").click();
await page.waitForTimeout(300);

const sideM = KM * 1000;
const pose = cameraPose45(sideM);
await page.evaluate((p) => window.__citycutQa?.setCamera({ eye: p.eye, target: p.target }), pose);
await page.waitForTimeout(1200);
await page.screenshot({ path: SHOT_WIDE, fullPage: false });

await page.evaluate(() => window.__citycutWalkRippleQa?.setMinutes(0));
await page.getByRole("button", { name: /Replay walk ripple/i }).click();
await page.waitForTimeout(10_000);
const webmPath = await page.video()?.path();
await context.close();
await browser.close();

if (!webmPath) throw new Error("Playwright did not record walk ripple video");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-i",
    webmPath,
    "-t",
    "10",
    "-r",
    "24",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "28",
    "-movflags",
    "+faststart",
    CLIP,
  ],
  { stdio: "inherit" },
);
rmSync(VIDEO_TMP, { recursive: true, force: true });

const pool = amenityGate.pool;
const summary = {
  screenshotWide: SHOT_WIDE,
  screenshotCard: SHOT_CARD,
  clip: CLIP,
  amenityPool: pool,
  hudCountsAtCapture: counts,
  consoleErrors: consoleErrors.filter((line) => !/502|favicon/i.test(line)),
};
console.log(JSON.stringify(summary, null, 2));

if (summary.consoleErrors.length > 0) process.exit(1);
