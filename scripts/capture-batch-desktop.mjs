import { chromium } from "playwright";
import fs from "node:fs";

const out = "/opt/cursor/artifacts/batch-desktop.png";
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });

const url = "http://127.0.0.1:5173/citycut/?lat=-37.8136&lon=144.9631&km=1";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(120_000);

await page.goto(url, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Layers", exact: true }).click();
await page.waitForSelector(".drawer-section:not([hidden]) input[type=range]");
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(`wrote ${out}`);
