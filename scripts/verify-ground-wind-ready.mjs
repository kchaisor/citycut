import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL =
  "http://127.0.0.1:4173/citycut/?qa=1&debug=wind&lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1";

const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4173"], {
  cwd: "/agent/repos/citycut",
  stdio: "ignore",
});

await new Promise((resolve) => setTimeout(resolve, 2500));

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});

const started = Date.now();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60_000);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.locator("button.create-fab").click({ timeout: 120_000 });
  await page.waitForSelector(".model", { timeout: 420_000 });
  await page.getByText("Ready", { exact: false }).first().waitFor({ timeout: 420_000 });
  const windBtn = page.getByRole("button", { name: /3D Wind Flow/i });
  if (await windBtn.count()) await windBtn.click();
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(2000);
  const shot = await Promise.race([
    page.screenshot({ timeout: 10_000 }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("screenshot timed out at 10s")), 10_000)),
  ]);
  if (!shot || (shot instanceof Uint8Array && shot.length < 1000)) {
    throw new Error("screenshot empty");
  }
  const elapsed = Date.now() - started;
  console.log(JSON.stringify({ ok: true, elapsedMs: elapsed, bytes: shot.length }));
} finally {
  await browser.close();
  preview.kill("SIGTERM");
}
