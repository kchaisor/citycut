#!/usr/bin/env node
/**
 * Permanent CityCut UI & 4-Beat 2D->3D Transition Verification Harness
 *
 * Launches a dedicated Vite dev server, drives Chromium at 1440x900 (@2x),
 * mechanically asserts all Typography, CSS Surface, 4-Beat 2D->3D Transition,
 * and Site Analysis Direction A invariants, and generates:
 *   - /workspace/pr164-v6-live-transition.mp4
 *   - /workspace/pr164-v6-transition-contact-sheet.png
 *   - /workspace/pr164-v6-beat2-isolated-cut.png
 *   - /workspace/pr164-v6-beat3a-matching-slab.png
 *   - /workspace/pr164-v6-beat3b-mid-extrude.png
 *   - /workspace/pr164-v6-beat4-settled-hud.png
 *
 * Exits with non-zero code (1) if ANY invariant check fails.
 */

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { chromium } from "playwright";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;
const ARTIFACTS_DIR = "/workspace";
const TMP_FRAMES_DIR = "/tmp/citycut_verify_frames";
const TMP_VIDEO_DIR = "/tmp/citycut_verify_video_frames";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 5188;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
        // retry
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for Vite server at ${url}`));
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

async function main() {
  fs.rmSync(TMP_FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_FRAMES_DIR, { recursive: true });
  fs.rmSync(TMP_VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_VIDEO_DIR, { recursive: true });

  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const viteProc = spawn(
    path.join(process.cwd(), "node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    },
  );

  let browser = null;
  const results = [];
  const assertCheck = (id, description, condition, details = "") => {
    const ok = Boolean(condition);
    results.push({ id, description, ok, details });
    const badge = ok ? "PASS" : "FAIL";
    console.log(`[${badge}] ${id}: ${description}${details ? ` (${details})` : ""}`);
  };

  try {
    await waitForServer(baseUrl);

    browser = await chromium.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--disable-dev-shm-usage",
        "--no-sandbox",
      ],
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      reducedMotion: "no-preference",
    });

    await context.addInitScript(() => {
      window.__citycutMinBeat2Ms = 850;
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("[PAGEERROR]", err.stack || err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error("[CONSOLE.ERROR]", msg.text());
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".select .frame", { timeout: 15000 });
    await page.waitForSelector("button.create-fab", { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);

    // -------------------------------------------------------------------------
    // BEAT 1: Landing Screen
    // -------------------------------------------------------------------------
    const beat1Info = await page.evaluate(() => {
      const cta = document.querySelector("button.create-fab");
      const frame = document.querySelector(".select .frame");
      const frameRect = frame?.getBoundingClientRect();
      return {
        ctaText: cta?.textContent?.trim() ?? "",
        hasFrame: Boolean(frame && frameRect && frameRect.width > 200 && frameRect.height > 200),
        frameRect: frameRect
          ? {
              left: Math.round(frameRect.left),
              top: Math.round(frameRect.top),
              width: Math.round(frameRect.width),
              height: Math.round(frameRect.height),
            }
          : null,
        frameRatio: window.__citycutFrameRatio ?? null,
      };
    });

    await page.screenshot({ path: path.join(TMP_FRAMES_DIR, "frame_01.png") });

    assertCheck(
      "beat1-landing",
      "Landing screen loads cleanly with 'Create model' CTA and centered 2D selection frame",
      beat1Info.ctaText.includes("Create model") && beat1Info.hasFrame,
      `cta="${beat1Info.ctaText}", frame=${JSON.stringify(beat1Info.frameRect)}, ratio=${beat1Info.frameRatio?.toFixed(3)}`,
    );

    // -------------------------------------------------------------------------
    // BEAT 2: Isolation & Loading
    // -------------------------------------------------------------------------
    await page.click("button.create-fab");
    await page.waitForSelector(".select.is-loading .loading-hud-pill", { timeout: 5000 });
    await page.waitForTimeout(220);

    await page.screenshot({ path: path.join(TMP_FRAMES_DIR, "frame_02.png") });

    const beat2Info = await page.evaluate(() => {
      const selectEl = document.querySelector(".select");
      const frameEl = document.querySelector(".select.is-loading .map-wrap .frame");
      const omnibox = document.querySelector(".select .omnibox-stack");
      const dock = document.querySelector(".select .bottom-workbench");
      const pill = document.querySelector(".select.is-loading .loading-hud-pill");
      const progTrack = document.querySelector(".select.is-loading .loading-hud-pill .loading-prog-track");
      const progPct = document.querySelector(".select.is-loading .loading-hud-pill .loading-prog-pct");
      const frameCs = frameEl ? getComputedStyle(frameEl) : null;
      const omniCs = omnibox ? getComputedStyle(omnibox) : null;
      const dockCs = dock ? getComputedStyle(dock) : null;
      const pillCs = pill ? getComputedStyle(pill) : null;
      const frameRect = frameEl?.getBoundingClientRect();
      return {
        isLoading: selectEl?.classList.contains("is-loading") ?? false,
        frameBoxShadow: frameCs?.boxShadow ?? "",
        pillVisible: Boolean(pill),
        pillOpacity: pillCs?.opacity ?? "0",
        pillBg: pillCs?.backgroundColor ?? "",
        hasProgBar: Boolean(progTrack && progPct),
        progText: progPct?.textContent?.trim() ?? "",
        omniboxOpacity: omniCs?.opacity ?? "1",
        dockOpacity: dockCs?.opacity ?? "1",
        frameIsolated: Boolean(frameRect && frameRect.width > 200 && frameRect.height > 200),
      };
    });

    await page.waitForTimeout(220);
    const frame03Path = path.join(TMP_FRAMES_DIR, "frame_03.png");
    await page.screenshot({ path: frame03Path });
    if (fs.existsSync(ARTIFACTS_DIR)) {
      fs.copyFileSync(frame03Path, path.join(ARTIFACTS_DIR, "pr164-v6-beat2-isolated-cut.png"));
    }

    assertCheck(
      "beat2-isolation",
      "Outer 2D map outside selection square is masked to #EBEBEB (rgb(235, 235, 235)), Landing chrome hidden (opacity 0), dark #141413 top .loading-hud-pill visible, and 2D selection square isolated",
      beat2Info.isLoading &&
        beat2Info.frameBoxShadow.includes("rgb(235, 235, 235)") &&
        beat2Info.frameBoxShadow.includes("9999px") &&
        beat2Info.omniboxOpacity === "0" &&
        beat2Info.dockOpacity === "0" &&
        beat2Info.pillOpacity === "1" &&
        beat2Info.pillBg.includes("20, 20, 19") &&
        beat2Info.hasProgBar &&
        beat2Info.frameIsolated,
      `mask=${beat2Info.frameBoxShadow.slice(0, 46)}, omniboxOpacity=${beat2Info.omniboxOpacity}, dockOpacity=${beat2Info.dockOpacity}, pillBg=${beat2Info.pillBg}, prog=${beat2Info.progText}`,
    );

    // -------------------------------------------------------------------------
    // BEAT 3: Simultaneous Tilt + Extrude (Frame 1 Top-Down -> Mid-Tilt/Mid-Extrude)
    // -------------------------------------------------------------------------
    try {
      await page.waitForSelector(".model canvas[data-intro-scale][data-intro-polar]", { timeout: 12000 });
    } catch (e) {
      const debugDom = await page.evaluate(() => ({
        phaseSelect: Boolean(document.querySelector(".select")),
        isLoading: document.querySelector(".select")?.classList.contains("is-loading"),
        errorText: document.querySelector("[role='alert']")?.textContent ?? null,
        hasModel: Boolean(document.querySelector(".model")),
        hasCanvas: Boolean(document.querySelector(".model canvas")),
        canvasDataset: document.querySelector(".model canvas") ? { ...document.querySelector(".model canvas").dataset } : null,
        bodyHtml: document.body.innerHTML.slice(0, 400),
      }));
      console.error("[DEBUG DOM ON TIMEOUT]", JSON.stringify(debugDom));
      throw e;
    }

    // Pause intro clock while taking @2x PNG screenshot of Frame 1
    await page.evaluate(() => {
      window.__citycutIntroPaused = true;
    });

    const beat3Start = await page.evaluate(() => {
      const canvas = document.querySelector(".model canvas");
      const modelEl = document.querySelector(".model");
      const topBar = document.querySelector(".model .top-bar-left");
      const leftOutliner = document.querySelector(".model .left-outliner");
      const rightInsp = document.querySelector(".model .right-inspector");
      const bottomBar = document.querySelector(".model .bottom-bar");
      const bridgePill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      return {
        polar: Number(canvas?.dataset.introPolar ?? 99),
        scale: Number(canvas?.dataset.introScale ?? 99),
        radius: Number(canvas?.dataset.introRadius ?? 0),
        elapsed: Number(canvas?.dataset.introElapsed ?? 99),
        introHold: modelEl?.getAttribute("data-intro-hold") ?? null,
        topOpacity: topBar ? getComputedStyle(topBar).opacity : "1",
        leftOpacity: leftOutliner ? getComputedStyle(leftOutliner).opacity : "1",
        rightOpacity: rightInsp ? getComputedStyle(rightInsp).opacity : "1",
        bottomOpacity: bottomBar ? getComputedStyle(bottomBar).opacity : "1",
        bridgePillOpacity: bridgePill ? getComputedStyle(bridgePill).opacity : "0",
      };
    });

    const frame04Path = path.join(TMP_FRAMES_DIR, "frame_04.png");
    await page.screenshot({ path: frame04Path });
    if (fs.existsSync(ARTIFACTS_DIR)) {
      fs.copyFileSync(frame04Path, path.join(ARTIFACTS_DIR, "pr164-v6-beat3a-matching-slab.png"));
    }

    await page.evaluate(() => {
      window.__citycutIntroPaused = false;
    });

    assertCheck(
      "beat3-frame1-topdown",
      "Frame 1 of 3D starts top-down (polar <= 0.10, building scale near 0, slab distance matched to 2D cut square) with Studio HUD hidden (opacity 0)",
      beat3Start.polar <= 0.10 &&
        beat3Start.scale <= 0.05 &&
        beat3Start.radius >= 1100 &&
        beat3Start.topOpacity === "0" &&
        beat3Start.leftOpacity === "0" &&
        beat3Start.rightOpacity === "0" &&
        beat3Start.bottomOpacity === "0",
      `polar=${beat3Start.polar}, scale=${beat3Start.scale}, radius=${beat3Start.radius}m, hudOpacities=[${beat3Start.topOpacity},${beat3Start.leftOpacity},${beat3Start.rightOpacity},${beat3Start.bottomOpacity}]`,
    );

    // Poll for mid-tilt + mid-extrude (0.2 < scale < 0.85) while Studio HUD remains hidden (opacity === "0")
    let beat3Mid = null;
    let beat3Late = null;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 15000) {
      const sample = await page.evaluate(() => {
        const canvas = document.querySelector(".model canvas");
        const modelEl = document.querySelector(".model");
        const topBar = document.querySelector(".model .top-bar-left");
        const leftOutliner = document.querySelector(".model .left-outliner");
        const rightInsp = document.querySelector(".model .right-inspector");
        const bottomBar = document.querySelector(".model .bottom-bar");
        return {
          polar: Number(canvas?.dataset.introPolar ?? 0),
          scale: Number(canvas?.dataset.introScale ?? 0),
          radius: Number(canvas?.dataset.introRadius ?? 0),
          elapsed: Number(canvas?.dataset.introElapsed ?? 0),
          introHold: modelEl?.getAttribute("data-intro-hold") ?? null,
          topOpacity: topBar ? getComputedStyle(topBar).opacity : "1",
          leftOpacity: leftOutliner ? getComputedStyle(leftOutliner).opacity : "1",
          rightOpacity: rightInsp ? getComputedStyle(rightInsp).opacity : "1",
          bottomOpacity: bottomBar ? getComputedStyle(bottomBar).opacity : "1",
        };
      });

      if (!beat3Mid && sample.scale > 0.20 && sample.scale < 0.85 && sample.polar > 0.20 && sample.introHold === "true") {
        await page.evaluate(() => {
          window.__citycutIntroPaused = true;
        });
        beat3Mid = sample;
        const frame05Path = path.join(TMP_FRAMES_DIR, "frame_05.png");
        await page.screenshot({ path: frame05Path });
        if (fs.existsSync(ARTIFACTS_DIR)) {
          fs.copyFileSync(frame05Path, path.join(ARTIFACTS_DIR, "pr164-v6-beat3b-mid-extrude.png"));
        }
        await page.evaluate(() => {
          window.__citycutIntroPaused = false;
        });
      }

      if (!beat3Late && sample.scale >= 0.75 && sample.scale < 0.99) {
        await page.evaluate(() => {
          window.__citycutIntroPaused = true;
        });
        beat3Late = sample;
        await page.screenshot({ path: path.join(TMP_FRAMES_DIR, "frame_06.png") });
        await page.evaluate(() => {
          window.__citycutIntroPaused = false;
        });
      }

      if (sample.scale >= 1 && sample.introHold === null) {
        break;
      }
      await page.waitForTimeout(25);
    }

    assertCheck(
      "beat3-mid-tilt-extrude",
      "Mid-transition simultaneously tilts camera and extrudes buildings (0.2 < scale < 0.85) while Studio HUD panels remain hidden (opacity === '0')",
      Boolean(
        beat3Mid &&
          beat3Mid.scale > 0.2 &&
          beat3Mid.scale < 0.85 &&
          beat3Mid.polar > 0.20 &&
          beat3Mid.polar < 1.0 &&
          beat3Mid.topOpacity === "0" &&
          beat3Mid.leftOpacity === "0" &&
          beat3Mid.rightOpacity === "0" &&
          beat3Mid.bottomOpacity === "0",
      ),
      beat3Mid
        ? `polar=${beat3Mid.polar}, scale=${beat3Mid.scale}, elapsed=${beat3Mid.elapsed}s, hudOpacities=[${beat3Mid.topOpacity},${beat3Mid.leftOpacity},${beat3Mid.rightOpacity},${beat3Mid.bottomOpacity}]`
        : "did not capture mid sample",
    );

    // -------------------------------------------------------------------------
    // BEAT 4: Settled Isometric + Studio HUD Slide-In
    // -------------------------------------------------------------------------
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(TMP_FRAMES_DIR, "frame_07.png") });
    await page.waitForTimeout(650);

    const frame08Path = path.join(TMP_FRAMES_DIR, "frame_08.png");
    await page.screenshot({ path: frame08Path });
    if (fs.existsSync(ARTIFACTS_DIR)) {
      fs.copyFileSync(frame08Path, path.join(ARTIFACTS_DIR, "pr164-v6-beat4-settled-hud.png"));
    }

    if (!fs.existsSync(path.join(TMP_FRAMES_DIR, "frame_05.png"))) {
      fs.copyFileSync(frame04Path, path.join(TMP_FRAMES_DIR, "frame_05.png"));
    }
    if (!fs.existsSync(path.join(TMP_FRAMES_DIR, "frame_06.png"))) {
      fs.copyFileSync( path.join(TMP_FRAMES_DIR, "frame_07.png"), path.join(TMP_FRAMES_DIR, "frame_06.png"));
    }

    const beat4Info = await page.evaluate(() => {
      const canvas = document.querySelector(".model canvas");
      const modelEl = document.querySelector(".model");
      const topBar = document.querySelector(".model .top-bar-left");
      const leftOutliner = document.querySelector(".model .left-outliner");
      const rightInsp = document.querySelector(".model .right-inspector");
      const bottomBar = document.querySelector(".model .bottom-bar");
      const bridgePill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      return {
        polar: Number(canvas?.dataset.introPolar ?? 0),
        scale: Number(canvas?.dataset.introScale ?? 0),
        introHold: modelEl?.getAttribute("data-intro-hold") ?? null,
        topOpacity: topBar ? getComputedStyle(topBar).opacity : "0",
        leftOpacity: leftOutliner ? getComputedStyle(leftOutliner).opacity : "0",
        rightOpacity: rightInsp ? getComputedStyle(rightInsp).opacity : "0",
        bottomOpacity: bottomBar ? getComputedStyle(bottomBar).opacity : "0",
        bridgePillOpacity: bridgePill ? getComputedStyle(bridgePill).opacity : "1",
      };
    });

    assertCheck(
      "beat4-settled-hud",
      "Camera settles at final isometric perspective (polar >= 0.95), buildings reach scale === 1.0, and Left Outliner, Right SITE INTELLIGENCE, Top Bar, and Bottom Bar slide in to opacity === '1'",
      beat4Info.polar >= 0.95 &&
        beat4Info.scale === 1 &&
        beat4Info.introHold === null &&
        beat4Info.topOpacity === "1" &&
        beat4Info.leftOpacity === "1" &&
        beat4Info.rightOpacity === "1" &&
        beat4Info.bottomOpacity === "1" &&
        beat4Info.bridgePillOpacity === "0",
      `polar=${beat4Info.polar}, scale=${beat4Info.scale}, hudOpacities=[${beat4Info.topOpacity},${beat4Info.leftOpacity},${beat4Info.rightOpacity},${beat4Info.bottomOpacity}], bridgePill=${beat4Info.bridgePillOpacity}`,
    );

    // -------------------------------------------------------------------------
    // TYPOGRAPHY & CSS SURFACE INVARIANTS
    // -------------------------------------------------------------------------
    const uiInvariants = await page.evaluate(() => {
      const bodyFont = getComputedStyle(document.body).fontFamily;
      const monoEl = document.querySelector(".mono, .coord-chip, .right-inspector");
      const monoFont = monoEl ? getComputedStyle(monoEl).fontFamily : "";
      const geistLoaded = Array.from(document.fonts).some(
        (f) => f.family.includes("Geist") && f.status === "loaded",
      );
      const geistMonoLoaded = Array.from(document.fonts).some(
        (f) => f.family.includes("Geist Mono") && f.status === "loaded",
      );

      const rightInsp = document.querySelector(".model .right-inspector");
      const rightPanel = document.querySelector(".model .sidebar-panel.is-right");
      const rightInspCs = rightInsp ? getComputedStyle(rightInsp) : null;
      const rightPanelCs = rightPanel ? getComputedStyle(rightPanel) : null;

      let legacyBleedCount = 0;
      if (rightInsp) {
        for (const el of rightInsp.querySelectorAll("*")) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg === "rgb(219, 219, 219)" || bg === "rgb(235, 235, 235)") {
            legacyBleedCount += 1;
          }
        }
      }

      const outlinerHeader = document.querySelector(
        ".model .left-outliner .card-title, .model .left-outliner .outliner-section-title",
      );
      const outlinerText = outlinerHeader ? outlinerHeader.innerText.trim() : "";

      const hudSelectors = [
        ".model .top-bar-left",
        ".model .top-bar-center",
        ".model .top-bar-right",
        ".model .left-rail",
        ".model .left-outliner",
        ".model .right-inspector",
        ".model .bottom-bar",
      ];
      const rects = [];
      for (const sel of hudSelectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && getComputedStyle(el).opacity !== "0") {
          rects.push({ sel, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }
      }
      const overlaps = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          if (xOverlap > 1 && yOverlap > 1) {
            overlaps.push(`${a.sel}<->${b.sel} (${Math.round(xOverlap)}x${Math.round(yOverlap)})`);
          }
        }
      }

      return {
        bodyFont,
        monoFont,
        geistLoaded,
        geistMonoLoaded,
        rightInspBorder: rightInspCs?.borderTopWidth ?? "none",
        rightPanelBorder: rightPanelCs?.borderTopWidth ?? "none",
        rightPanelBg: rightPanelCs?.backgroundColor ?? "",
        legacyBleedCount,
        outlinerText,
        overlaps,
      };
    });

    assertCheck(
      "typography-geist",
      "Geist + Geist Mono loaded and applied on document.body (never serif fallback)",
      uiInvariants.bodyFont.startsWith("Geist") &&
        !uiInvariants.bodyFont.toLowerCase().startsWith("times") &&
        uiInvariants.geistLoaded &&
        uiInvariants.geistMonoLoaded,
      `fontFamily=${uiInvariants.bodyFont}, geist=${uiInvariants.geistLoaded}, geistMono=${uiInvariants.geistMonoLoaded}`,
    );

    assertCheck(
      "css-surface-hierarchy",
      ".right-inspector and .sidebar-panel.is-right have 0px border and zero legacy #DBDBDB/#EBEBEB inner bleed; Left outliner says VIEW STYLE; zero card overlap at 1440x900",
      uiInvariants.rightInspBorder === "0px" &&
        uiInvariants.rightPanelBorder === "0px" &&
        uiInvariants.legacyBleedCount === 0 &&
        uiInvariants.outlinerText.toUpperCase() === "VIEW STYLE" &&
        uiInvariants.overlaps.length === 0,
      `rightInspBorder=${uiInvariants.rightInspBorder}, rightPanelBorder=${uiInvariants.rightPanelBorder}, bleed=${uiInvariants.legacyBleedCount}, outliner="${uiInvariants.outlinerText}", overlaps=${uiInvariants.overlaps.length}`,
    );

    // -------------------------------------------------------------------------
    // SITE ANALYSIS DIRECTION A INVARIANT
    // -------------------------------------------------------------------------
    const analysisBtn = page.locator('.model button[data-section="analysis"]').first();
    await analysisBtn.click();
    await page.waitForTimeout(300);

    const analysisInfo = await page.evaluate(() => {
      const leftOutliners = Array.from(document.querySelectorAll(".model .left-outliner"));
      const visibleLeftDrawers = leftOutliners.filter((el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0" && r.width > 0 && r.height > 0;
      });
      const envConsole = document.querySelector(".model .env-console");
      const envRect = envConsole?.getBoundingClientRect();
      const topRow = envConsole?.querySelector(".env-top-row");
      const bottomRow = envConsole?.querySelector(".env-bottom-row");
      return {
        visibleLeftDrawerCount: visibleLeftDrawers.length,
        hasEnvConsole: Boolean(envConsole && envRect && envRect.width > 400 && envRect.height > 50),
        hasTwoRows: Boolean(topRow && bottomRow),
        envConsoleRect: envRect
          ? { width: Math.round(envRect.width), height: Math.round(envRect.height) }
          : null,
      };
    });

    assertCheck(
      "site-analysis-direction-a",
      "Clicking Analysis hides the left drawer completely (0 visible left drawer) and opens the 2-row bottom environmental console cleanly",
      analysisInfo.visibleLeftDrawerCount === 0 &&
        analysisInfo.hasEnvConsole &&
        analysisInfo.hasTwoRows,
      `visibleLeftDrawers=${analysisInfo.visibleLeftDrawerCount}, envConsole=${analysisInfo.hasEnvConsole}, twoRows=${analysisInfo.hasTwoRows}, rect=${JSON.stringify(analysisInfo.envConsoleRect)}`,
    );

    // -------------------------------------------------------------------------
    // GENERATE 8-FRAME CONTACT SHEET + LIVE TRANSITION MP4 VIDEO
    // -------------------------------------------------------------------------
    if (fs.existsSync(ARTIFACTS_DIR)) {
      const contactSheetOut = path.join(ARTIFACTS_DIR, "pr164-v6-transition-contact-sheet.png");
      execFileSync("ffmpeg", [
        "-y",
        "-pattern_type",
        "glob",
        "-i",
        `${TMP_FRAMES_DIR}/frame_*.png`,
        "-vf",
        "scale=720:450,tile=4x2:padding=8:margin=8:color=0x141413",
        "-frames:v",
        "1",
        "-update",
        "1",
        contactSheetOut,
      ]);

      // Build /workspace/pr164-v6-live-transition.mp4 from the captured real WebGL transition frames
      let vIdx = 0;
      const frameRepeats = [
        ["frame_01.png", 16], // Beat 1: Landing (0.64s)
        ["frame_02.png", 10], // Beat 2a: Isolated cut square + loading pill (0.40s)
        ["frame_03.png", 10], // Beat 2b: Isolated cut square progress (0.40s)
        ["frame_04.png", 6],  // Beat 3a: 3D Slab top-down matching cut square + yellow ring (0.24s)
        ["frame_05.png", 10], // Beat 3b: Simultaneous tilt + building extrusion (0.40s)
        ["frame_06.png", 10], // Beat 3c: Late tilt + extrusion (0.40s)
        ["frame_07.png", 8],  // Beat 4a: Settling isometric + HUD sliding in (0.32s)
        ["frame_08.png", 20], // Beat 4b: Settled isometric + full Studio HUD (0.80s)
      ];
      for (const [fName, count] of frameRepeats) {
        const src = path.join(TMP_FRAMES_DIR, fName);
        if (!fs.existsSync(src)) continue;
        for (let r = 0; r < count; r++) {
          vIdx += 1;
          const dst = path.join(TMP_VIDEO_DIR, `vframe_${String(vIdx).padStart(4, "0")}.png`);
          fs.copyFileSync(src, dst);
        }
      }
      const mp4Out = path.join(ARTIFACTS_DIR, "pr164-v6-live-transition.mp4");
      execFileSync("ffmpeg", [
        "-y",
        "-framerate",
        "25",
        "-i",
        `${TMP_VIDEO_DIR}/vframe_%04d.png`,
        "-vf",
        "scale=1440:900,minterpolate=fps=30:mi_mode=blend",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "18",
        "-movflags",
        "+faststart",
        mp4Out,
      ]);
      console.log(`[ARTIFACT] Video saved to ${mp4Out}`);
      console.log(`[ARTIFACT] Contact sheet saved to ${contactSheetOut}`);
    }
  } catch (err) {
    console.error("Fatal error in verify-citycut:", err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    viteProc.kill("SIGTERM");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== CityCut Verification Summary: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length > 0 || results.length === 0) {
    for (const f of failed) {
      console.error(`  FAILED: ${f.id} — ${f.description} (${f.details})`);
    }
    process.exit(1);
  }
}

main();
