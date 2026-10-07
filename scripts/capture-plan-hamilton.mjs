import { chromium } from "playwright";

const outDir = "/opt/cursor/artifacts";
const ADDRESS = "20 Hamilton Street, Mont Albert VIC";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300_000);

await page.goto("http://127.0.0.1:5173/citycut/?qa=1&buildings=uniform", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "Search", exact: true }).click();
await page.getByRole("combobox", { name: /Search a place/i }).fill(ADDRESS);
await page.waitForTimeout(1500);
await page.getByRole("option").first().click();
await page.waitForTimeout(800);

await page.getByRole("button", { name: "Layers", exact: true }).click();
const drawer = page.locator(".drawer-section:not([hidden])");
await drawer.locator('input[type="range"]').fill("0.4");
const trees = drawer.locator("li").filter({ hasText: "Trees" }).locator("button.toggle");
if ((await trees.getAttribute("aria-pressed")) === "true") await trees.click();
await page.getByRole("button", { name: "Layers", exact: true }).click();

await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.waitForTimeout(5000);

await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("tab", { name: "Drawing" }).click();
await page.waitForSelector(".fill.is-plan svg");
await page.locator('select[aria-label="Plan scale"]').selectOption("1000");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

const svg = page.locator(".fill.is-plan svg");
const box = await svg.boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.48);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -140);
    await page.waitForTimeout(100);
  }
}
await page.waitForTimeout(500);
const box2 = await svg.boundingBox();
if (box2) {
  await page.mouse.move(box2.x + box2.width * 0.5, box2.y + box2.height * 0.5);
}
await page.waitForTimeout(300);
await svg.screenshot({ path: `${outDir}/plan-uniform-dashdot.png` });
await browser.close();
console.log("plan saved");
