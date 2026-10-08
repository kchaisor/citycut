import { chromium } from "playwright";
import fs from "node:fs";

const VIEWPORT = { width: 1280, height: 800 };
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const query = "?lat=-37.8127&lon=144.98061&km=1&qa=1";
const out = "/opt/cursor/artifacts/east-melbourne-site-plan-legend-bca.png";

fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: VIEWPORT });
await page.goto(`${base}${query}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.getByRole("button", { name: "Buildings", exact: true }).click();
await page.waitForSelector("svg.plan path", { timeout: 120_000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log("Saved", out);
