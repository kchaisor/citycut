/**
 * Headless reload test: enrichment banner must stay absent (East Melbourne + CBD spot).
 * Usage: node scripts/bench-enrichment-load-reliability.mjs <baseUrl>
 */
import { chromium } from "playwright";

const base = process.argv[2]?.replace(/\/?$/, "/") ?? "http://127.0.0.1:4173/citycut/";
const SPOTS = [
  { id: "east-melbourne", lat: -37.8127, lon: 144.98061, km: 1, runs: 5 },
  { id: "cbd", lat: -37.8136, lon: 144.9631, km: 1, runs: 3 },
];
const SWIFT = [
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
];

async function loadOnce(page, spot, throttled) {
  const cdp = await page.context().newCDPSession(page);
  if (throttled) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  } else {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
  const url = `${base}?lat=${spot.lat}&lon=${spot.lon}&km=${spot.km}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector(".map-canvas .maplibregl-canvas", { timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(throttled ? 5000 : 3000);
  const banner = await page.locator(".enrichment-coverage-banner").count();
  const bannerText =
    banner > 0 ? await page.locator(".enrichment-coverage-banner").innerText() : "";
  const failed = banner > 0 && /could not be loaded/i.test(bannerText);
  return { failed, bannerText: failed ? bannerText.slice(0, 120) : "" };
}

const browser = await chromium.launch({ headless: true, args: SWIFT });
const results = [];

for (const throttled of [false, true]) {
  for (const spot of SPOTS) {
    for (let i = 0; i < spot.runs; i += 1) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      const row = await loadOnce(page, spot, throttled);
      results.push({
        server: base,
        spot: spot.id,
        throttled,
        run: i + 1,
        ...row,
      });
      await page.close();
    }
  }
}

await browser.close();
const failures = results.filter((r) => r.failed);
console.log(JSON.stringify({ base, total: results.length, failures: failures.length, results }, null, 2));
process.exit(failures.length > 0 ? 1 : 0);
