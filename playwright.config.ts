import { defineConfig, devices } from "@playwright/test";

const PREVIEW_PORT = 4173;
const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_BASE = `http://${PREVIEW_HOST}:${PREVIEW_PORT}/citycut/`;

const CHROME_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-webgl",
  "--disable-dev-shm-usage",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--no-sandbox",
];

export default defineConfig({
  testDir: "tests/visual",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 600_000,
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.02,
    },
  },
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    baseURL: PREVIEW_BASE,
    launchOptions: {
      args: CHROME_ARGS,
    },
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: `npm run preview -- --host ${PREVIEW_HOST} --port ${PREVIEW_PORT}`,
    url: PREVIEW_BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});