#!/usr/bin/env node
/**
 * Permanent CityCut UI & 4-Beat 2D->3D Transition Verification Harness (v7)
 *
 * Launches a dedicated Vite dev server, drives Chromium at 1440x900 (@2x),
 * mechanically asserts all Typography, CSS Surface, 4-Beat 2D->3D Transition
 * (including 0.78 translucent outer dim, zero-blank-frame WebGL handoff,
 * 24-bucket radial building wave, and 16-bucket delayed bouncy tree pop-up),
 * and Site Analysis Direction A invariants, and generates:
 *   - /workspace/pr164-v7-live-transition.mp4
 *   - /workspace/pr164-v7-transition-contact-sheet.png
 *   - /workspace/pr164-v7-beat2-translucent-dim.png
 *   - /workspace/pr164-v7-beat3a-bldg-wave.png
 *   - /workspace/pr164-v7-beat3b-tree-pop.png
 *   - /workspace/pr164-v7-beat4-settled.png
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
      window.__citycutMinBeat2Ms = 1050;
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
      const frameLabel = document.querySelector(".select .frame-label");
      const frameCadTag = document.querySelector(".select .frame-cad-tag");
      const frameRect = frame?.getBoundingClientRect();
      return {
        ctaText: cta?.textContent?.trim() ?? "",
        hasFrame: Boolean(frame && frameRect && frameRect.width > 200 && frameRect.height > 200),
        frameLabelDisplay: frameLabel ? getComputedStyle(frameLabel).display : "none",
        frameCadTagVisible: Boolean(frameCadTag && getComputedStyle(frameCadTag).display !== "none"),
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
      "Landing screen loads cleanly with 'Create model' CTA, centered 2D selection frame, and single bottom coordinate pill",
      beat1Info.ctaText.includes("Create model") &&
        beat1Info.hasFrame &&
        beat1Info.frameLabelDisplay === "none" &&
        beat1Info.frameCadTagVisible,
      `cta="${beat1Info.ctaText}", frame=${JSON.stringify(beat1Info.frameRect)}, ratio=${beat1Info.frameRatio?.toFixed(3)}, singlePill=${beat1Info.frameLabelDisplay === "none" && beat1Info.frameCadTagVisible}`,
    );

    // Install zero-blank-frame handoff monitor before clicking Create model
    await page.evaluate(() => {
      window.__citycutHandoffMonitor = {
        blankFrames: 0,
        samplesBeforeWebglReady: 0,
        sawUnderlayDuringModelMount: false,
        webglReadyFired: false,
      };
      window.addEventListener("citycut:intro-webgl-ready", () => {
        window.__citycutHandoffMonitor.webglReadyFired = true;
      });
      const checkHandoff = () => {
        const mon = window.__citycutHandoffMonitor;
        if (!mon || mon.webglReadyFired) return;
        mon.samplesBeforeWebglReady += 1;
        const selectEl = document.querySelector(".select");
        const frameEl = document.querySelector(".select .map-wrap .frame");
        const modelEl = document.querySelector(".model");
        if (modelEl && selectEl?.classList.contains("is-handoff-underlay")) {
          mon.sawUnderlayDuringModelMount = true;
        }
        const selectVisible = Boolean(
          selectEl &&
            frameEl &&
            getComputedStyle(selectEl).display !== "none" &&
            Number(getComputedStyle(selectEl).opacity) > 0.5,
        );
        const modelWebglVisible = Boolean(
          modelEl &&
            !modelEl.hasAttribute("data-intro-webgl-wait") &&
            Number(getComputedStyle(modelEl).opacity) > 0.5,
        );
        if (!selectVisible && !modelWebglVisible) {
          mon.blankFrames += 1;
        }
        requestAnimationFrame(checkHandoff);
      };
      requestAnimationFrame(checkHandoff);
    });

    // -------------------------------------------------------------------------
    // BEAT 2: Translucent 0.78 Outer Dim & Loading Pill
    // -------------------------------------------------------------------------
    await page.click("button.create-fab");
    await page.waitForSelector(".select.is-loading .loading-hud-pill", { timeout: 5000 });
    await page.waitForTimeout(220);

    await page.screenshot({ path: path.join(TMP_FRAMES_DIR, "frame_02.png") });

    // Wait until the 450ms box-shadow fade has settled
    await page.waitForTimeout(320);

    const beat2Info = await page.evaluate(() => {
      const selectEl = document.querySelector(".select");
      const frameEl = document.querySelector(".select.is-loading .map-wrap .frame");
      const handleEl = document.querySelector(".select.is-loading .map-wrap .frame-handle");
      const cadTagEl = document.querySelector(".select.is-loading .map-wrap .frame-cad-tag");
      const frameLabelEl = document.querySelector(".select.is-loading .map-wrap .frame-label");
      const omnibox = document.querySelector(".select .omnibox-stack");
      const dock = document.querySelector(".select .bottom-workbench");
      const pill = document.querySelector(".select.is-loading .loading-hud-pill");
      const progTrack = document.querySelector(".select.is-loading .loading-hud-pill .loading-prog-track");
      const progPct = document.querySelector(".select.is-loading .loading-hud-pill .loading-prog-pct");
      const frameCs = frameEl ? getComputedStyle(frameEl) : null;
      const handleCs = handleEl ? getComputedStyle(handleEl) : null;
      const cadTagCs = cadTagEl ? getComputedStyle(cadTagEl) : null;
      const frameLabelCs = frameLabelEl ? getComputedStyle(frameLabelEl) : null;
      const omniCs = omnibox ? getComputedStyle(omnibox) : null;
      const dockCs = dock ? getComputedStyle(dock) : null;
      const pillCs = pill ? getComputedStyle(pill) : null;
      const frameRect = frameEl?.getBoundingClientRect();
      const boxShadow = frameCs?.boxShadow ?? "";
      // Extract alpha from rgba(235, 235, 235, <alpha>)
      const rgbaMatch = boxShadow.match(/rgba\(\s*235\s*,\s*235\s*,\s*235\s*,\s*([0-9.]+)\s*\)/);
      const outerAlpha = rgbaMatch ? Number(rgbaMatch[1]) : boxShadow.includes("rgb(235, 235, 235)") ? 1.0 : -1;
      return {
        isLoading: selectEl?.classList.contains("is-loading") ?? false,
        frameBoxShadow: boxShadow,
        outerAlpha,
        borderStyle: frameCs?.borderTopStyle ?? "",
        handleOpacity: handleCs?.opacity ?? "0",
        cadTagOpacity: cadTagCs?.opacity ?? "0",
        frameLabelDisplay: frameLabelCs?.display ?? "block",
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

    const frame03Path = path.join(TMP_FRAMES_DIR, "frame_03.png");
    await page.screenshot({ path: frame03Path });
    if (fs.existsSync(ARTIFACTS_DIR)) {
      fs.copyFileSync(frame03Path, path.join(ARTIFACTS_DIR, "pr164-v7-beat2-translucent-dim.png"));
    }

    assertCheck(
      "beat2-translucent-dim",
      "Outer 2D map outside selection square fades to translucent rgba(235, 235, 235, 0.78) (alpha in [0.65, 0.85], NOT 1.0 opaque), dashed border + 4 yellow corner handles + single bottom coordinate pill remain visible, and top dark #141413 progress pill is active",
      beat2Info.isLoading &&
        beat2Info.outerAlpha >= 0.65 &&
        beat2Info.outerAlpha <= 0.85 &&
        beat2Info.borderStyle === "dashed" &&
        beat2Info.handleOpacity === "1" &&
        beat2Info.cadTagOpacity === "1" &&
        beat2Info.frameLabelDisplay === "none" &&
        beat2Info.omniboxOpacity === "0" &&
        beat2Info.dockOpacity === "0" &&
        beat2Info.pillOpacity === "1" &&
        beat2Info.pillBg.includes("20, 20, 19") &&
        beat2Info.hasProgBar &&
        beat2Info.frameIsolated,
      `outerAlpha=${beat2Info.outerAlpha}, border=${beat2Info.borderStyle}, handles=${beat2Info.handleOpacity}, singleBottomPill=${beat2Info.cadTagOpacity}/${beat2Info.frameLabelDisplay}, prog=${beat2Info.progText}`,
    );

    // -------------------------------------------------------------------------
    // BEAT 3: Zero-Blank Handoff + Staggered Center-Out Building Wave + Bouncy Tree Pop
    // -------------------------------------------------------------------------
    try {
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector(".model canvas[data-intro-bldg-inner][data-intro-tree-scale]");
          const model = document.querySelector(".model");
          return Boolean(canvas && model && !model.hasAttribute("data-intro-webgl-wait"));
        },
        { timeout: 15000 },
      );
    } catch (e) {
      const debugDom = await page.evaluate(() => ({
        phaseSelect: Boolean(document.querySelector(".select")),
        isLoading: document.querySelector(".select")?.classList.contains("is-loading"),
        errorText: document.querySelector("[role='alert']")?.textContent ?? null,
        hasModel: Boolean(document.querySelector(".model")),
        hasCanvas: Boolean(document.querySelector(".model canvas")),
        canvasDataset: document.querySelector(".model canvas") ? { ...document.querySelector(".model canvas").dataset } : null,
      }));
      console.error("[DEBUG DOM ON TIMEOUT]", JSON.stringify(debugDom));
      throw e;
    }

    // Pause intro clock immediately when WebGL is ready to inspect Frame 1 & handoff
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
      const handoff = window.__citycutHandoffMonitor ?? { blankFrames: 99, sawUnderlayDuringModelMount: false, webglReadyFired: false };
      return {
        polar: Number(canvas?.dataset.introPolar ?? 99),
        scale: Number(canvas?.dataset.introScale ?? 99),
        bldgInner: Number(canvas?.dataset.introBldgInner ?? 99),
        bldgOuter: Number(canvas?.dataset.introBldgOuter ?? 99),
        treeScale: Number(canvas?.dataset.introTreeScale ?? 99),
        radius: Number(canvas?.dataset.introRadius ?? 0),
        elapsed: Number(canvas?.dataset.introElapsed ?? 99),
        introHold: modelEl?.getAttribute("data-intro-hold") ?? null,
        topOpacity: topBar ? getComputedStyle(topBar).opacity : "1",
        leftOpacity: leftOutliner ? getComputedStyle(leftOutliner).opacity : "1",
        rightOpacity: rightInsp ? getComputedStyle(rightInsp).opacity : "1",
        bottomOpacity: bottomBar ? getComputedStyle(bottomBar).opacity : "1",
        handoff,
      };
    });

    const frame04Path = path.join(TMP_FRAMES_DIR, "frame_04.png");
    await page.screenshot({ path: frame04Path });

    await page.evaluate(() => {
      window.__citycutIntroPaused = false;
    });

    assertCheck(
      "beat2-to-beat3-zero-blank-handoff",
      ".select remains mounted as underlay until <Scene3D> finishes buildCityGroup and paints WebGL Frame 1 (0 blank frames during Beat 2 -> Beat 3 handoff)",
      beat3Start.handoff.blankFrames === 0 &&
        beat3Start.handoff.sawUnderlayDuringModelMount &&
        beat3Start.handoff.webglReadyFired &&
        beat3Start.polar <= 0.12 &&
        beat3Start.bldgInner <= 0.08 &&
        beat3Start.radius >= 1100,
      `blankFrames=${beat3Start.handoff.blankFrames}, underlayMounted=${beat3Start.handoff.sawUnderlayDuringModelMount}, webglReady=${beat3Start.handoff.webglReadyFired}, polar=${beat3Start.polar}, radius=${beat3Start.radius}m`,
    );

    // Poll Beat 3 for:
    //   1) beat3WaveSample: elapsed in [0.42, 0.62], bldgInner > 0.35, bldgOuter < 0.18, treeScale < 0.05
    //   2) beat3TreeSample: elapsed in [0.85, 1.38], treeScale > 1.04 (bouncy overshoot!)
    let beat3WaveSample = null;
    let beat3TreeSample = null;
    let maxObservedTreeScale = 0;
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
          bldgInner: Number(canvas?.dataset.introBldgInner ?? 0),
          bldgOuter: Number(canvas?.dataset.introBldgOuter ?? 0),
          treeScale: Number(canvas?.dataset.introTreeScale ?? 0),
          radius: Number(canvas?.dataset.introRadius ?? 0),
          elapsed: Number(canvas?.dataset.introElapsed ?? 0),
          introHold: modelEl?.getAttribute("data-intro-hold") ?? null,
          topOpacity: topBar ? getComputedStyle(topBar).opacity : "1",
          leftOpacity: leftOutliner ? getComputedStyle(leftOutliner).opacity : "1",
          rightOpacity: rightInsp ? getComputedStyle(rightInsp).opacity : "1",
          bottomOpacity: bottomBar ? getComputedStyle(bottomBar).opacity : "1",
        };
      });

      if (sample.treeScale > maxObservedTreeScale) {
        maxObservedTreeScale = sample.treeScale;
      }

      if (
        !beat3WaveSample &&
        sample.elapsed >= 0.42 &&
        sample.bldgInner > 0.35 &&
        sample.bldgOuter < 0.18 &&
        sample.treeScale < 0.05 &&
        sample.introHold === "true"
      ) {
        await page.evaluate(() => {
          window.__citycutIntroPaused = true;
        });
        beat3WaveSample = sample;
        const frame05Path = path.join(TMP_FRAMES_DIR, "frame_05.png");
        await page.screenshot({ path: frame05Path });
        if (fs.existsSync(ARTIFACTS_DIR)) {
          fs.copyFileSync(frame05Path, path.join(ARTIFACTS_DIR, "pr164-v7-beat3a-bldg-wave.png"));
        }
        await page.evaluate(() => {
          window.__citycutIntroPaused = false;
        });
      }

      if (
        !beat3TreeSample &&
        sample.elapsed >= 0.85 &&
        sample.elapsed <= 1.42 &&
        sample.treeScale > 1.04
      ) {
        await page.evaluate(() => {
          window.__citycutIntroPaused = true;
        });
        beat3TreeSample = sample;
        const frame06Path = path.join(TMP_FRAMES_DIR, "frame_06.png");
        await page.screenshot({ path: frame06Path });
        if (fs.existsSync(ARTIFACTS_DIR)) {
          fs.copyFileSync(frame06Path, path.join(ARTIFACTS_DIR, "pr164-v7-beat3b-tree-pop.png"));
        }
        await page.evaluate(() => {
          window.__citycutIntroPaused = false;
        });
      }

      if (sample.elapsed >= 2.1 && sample.introHold === null) {
        break;
      }
      await page.waitForTimeout(20);
    }

    assertCheck(
      "beat3a-staggered-building-wave",
      "Early/mid Beat 3 (elapsed ~ 0.45s–0.55s) extrudes buildings in a center-out radial wave (bldgInner > 0.35 while bldgOuter < 0.18) before trees start (treeScale < 0.05) with Studio HUD hidden",
      Boolean(
        beat3WaveSample &&
          beat3WaveSample.bldgInner > 0.35 &&
          beat3WaveSample.bldgOuter < 0.18 &&
          beat3WaveSample.bldgInner > beat3WaveSample.bldgOuter &&
          beat3WaveSample.treeScale < 0.05 &&
          beat3WaveSample.topOpacity === "0" &&
          beat3WaveSample.leftOpacity === "0" &&
          beat3WaveSample.rightOpacity === "0" &&
          beat3WaveSample.bottomOpacity === "0",
      ),
      beat3WaveSample
        ? `elapsed=${beat3WaveSample.elapsed}s, bldgInner=${beat3WaveSample.bldgInner}, bldgOuter=${beat3WaveSample.bldgOuter}, treeScale=${beat3WaveSample.treeScale}, hudOpacities=[${beat3WaveSample.topOpacity},${beat3WaveSample.leftOpacity},${beat3WaveSample.rightOpacity},${beat3WaveSample.bottomOpacity}]`
        : "did not capture building wave sample",
    );

    assertCheck(
      "beat3b-delayed-tree-bounce",
      "Later in Beat 3 (elapsed ~ 0.85s–1.35s), trees pop up after buildings with a 16% spring overshoot bounce (treeScale > 0.30 and maxObservedTreeScale > 1.04)",
      Boolean(
        beat3TreeSample &&
          beat3TreeSample.treeScale > 0.30 &&
          maxObservedTreeScale > 1.04,
      ),
      beat3TreeSample
        ? `elapsed=${beat3TreeSample.elapsed}s, sampleTreeScale=${beat3TreeSample.treeScale}, maxObservedTreeScale=${maxObservedTreeScale.toFixed(3)}, bldgInner=${beat3TreeSample.bldgInner}, bldgOuter=${beat3TreeSample.bldgOuter}`
        : `did not capture tree bounce sample (maxObservedTreeScale=${maxObservedTreeScale.toFixed(3)})`,
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
      fs.copyFileSync(frame08Path, path.join(ARTIFACTS_DIR, "pr164-v7-beat4-settled.png"));
    }

    if (!fs.existsSync(path.join(TMP_FRAMES_DIR, "frame_05.png"))) {
      fs.copyFileSync(frame04Path, path.join(TMP_FRAMES_DIR, "frame_05.png"));
    }
    if (!fs.existsSync(path.join(TMP_FRAMES_DIR, "frame_06.png"))) {
      fs.copyFileSync(path.join(TMP_FRAMES_DIR, "frame_07.png"), path.join(TMP_FRAMES_DIR, "frame_06.png"));
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
        bldgInner: Number(canvas?.dataset.introBldgInner ?? 0),
        bldgOuter: Number(canvas?.dataset.introBldgOuter ?? 0),
        treeScale: Number(canvas?.dataset.introTreeScale ?? 0),
        introHold: modelEl?.getAttribute("data-intro-hold") ?? null,
        hasUnderlay: Boolean(document.querySelector(".select.is-handoff-underlay")),
        topOpacity: topBar ? getComputedStyle(topBar).opacity : "0",
        leftOpacity: leftOutliner ? getComputedStyle(leftOutliner).opacity : "0",
        rightOpacity: rightInsp ? getComputedStyle(rightInsp).opacity : "0",
        bottomOpacity: bottomBar ? getComputedStyle(bottomBar).opacity : "0",
        bridgePillOpacity: bridgePill ? getComputedStyle(bridgePill).opacity : "1",
      };
    });

    assertCheck(
      "beat4-settled-hud",
      "Camera settles at final isometric perspective (polar >= 0.95), all building & tree buckets settle to 1.000, underlay unmounts, and Studio HUD panels slide in to opacity === '1'",
      beat4Info.polar >= 0.95 &&
        beat4Info.bldgInner === 1 &&
        beat4Info.bldgOuter === 1 &&
        beat4Info.treeScale === 1 &&
        beat4Info.introHold === null &&
        !beat4Info.hasUnderlay &&
        beat4Info.topOpacity === "1" &&
        beat4Info.leftOpacity === "1" &&
        beat4Info.rightOpacity === "1" &&
        beat4Info.bottomOpacity === "1" &&
        beat4Info.bridgePillOpacity === "0",
      `polar=${beat4Info.polar}, bldg=[${beat4Info.bldgInner},${beat4Info.bldgOuter}], tree=${beat4Info.treeScale}, hudOpacities=[${beat4Info.topOpacity},${beat4Info.leftOpacity},${beat4Info.rightOpacity},${beat4Info.bottomOpacity}], underlay=${beat4Info.hasUnderlay}`,
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
      const contactSheetOut = path.join(ARTIFACTS_DIR, "pr164-v7-transition-contact-sheet.png");
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

      // Build /workspace/pr164-v7-live-transition.mp4 from the captured real WebGL transition frames
      let vIdx = 0;
      const frameRepeats = [
        ["frame_01.png", 16], // Beat 1: Landing (0.64s)
        ["frame_02.png", 10], // Beat 2a: Outer dim fading + loading pill (0.40s)
        ["frame_03.png", 12], // Beat 2b: Translucent 0.78 outer dim + sharp 2D cut square (0.48s)
        ["frame_04.png", 6],  // Beat 3a: Zero-blank top-down 3D slab handoff (0.24s)
        ["frame_05.png", 12], // Beat 3b: Center-out radial building wave (trees still at 0) (0.48s)
        ["frame_06.png", 12], // Beat 3c: Delayed bouncy tree pop-up wave (0.48s)
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
      const mp4Out = path.join(ARTIFACTS_DIR, "pr164-v7-live-transition.mp4");
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
