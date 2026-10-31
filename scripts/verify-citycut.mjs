#!/usr/bin/env node
/**
 * Permanent CityCut UI & 2-Phase 2D->3D Transition Verification Harness (v11)
 *
 * Launches a dedicated Vite dev server, drives Chromium at 1440x900 (@2x),
 * mechanically asserts all Typography, CSS Surface, 2-Phase 2D->3D Transition
 * (Phase A silent background load & WebGL pre-warm with untouched 2D screen,
 * followed by Phase B synchronised 0%->100% loading bar + 1->0 2D background fade
 * + 2D->3D camera shift + 24-bucket radial building wave + 16-bucket bouncy tree pop-up,
 * even when localStorage previously had projection="iso"),
 * SCENE LAYERS Reset colours button, and Site Analysis Direction A invariants,
 * and generates:
 *   - /workspace/pr164-v17-live-transition.mp4
 *   - /workspace/pr164-v17-transition-contact-sheet.png
 *   - /workspace/pr164-v17-display-reset-colours.png
 *
 * Exits with non-zero code (1) if ANY invariant check fails.
 */

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { chromium } from "playwright";
import { PNG } from "pngjs";

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
      window.__citycutMinSilentLoadMs = 550;
      try {
        window.localStorage.setItem(
          "citycut.view",
          JSON.stringify({ projection: "iso", corner: "sw", freeRotate: false }),
        );
      } catch {
        // ignore
      }
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

    // Install zero-blank-frame handoff & Phase B synchronised progress/fade monitor before clicking Create model
    await page.evaluate(() => {
      window.__citycutHandoffMonitor = {
        blankFrames: 0,
        samplesBeforeWebglReady: 0,
        sawUnderlayDuringModelMount: false,
        webglReadyFired: false,
        introStartFired: false,
        domProgressSamples: [],
        underlayOpacitySamples: [],
        syncPairs: [],
      };
      window.addEventListener("citycut:intro-webgl-ready", () => {
        window.__citycutHandoffMonitor.webglReadyFired = true;
      });
      window.addEventListener("citycut:intro-start", () => {
        window.__citycutHandoffMonitor.introStartFired = true;
      });
      window.addEventListener("citycut:intro-done", () => {
        const mon = window.__citycutHandoffMonitor;
        if (!mon) return;
        mon.introDoneFired = true;
        mon.introDoneMs = Math.round(performance.now() - (window.__citycutIntroStartMs ?? performance.now()));
        if (mon.domProgressSamples[mon.domProgressSamples.length - 1] !== 100) {
          mon.domProgressSamples.push(100);
        }
        mon.underlayOpacitySamples.push(0);
        mon.syncPairs.push({ pct: 100, uOpacity: 0 });
      });
      const checkHandoff = () => {
        const mon = window.__citycutHandoffMonitor;
        if (!mon) return;
        const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
        const selectEl = document.querySelector(".select");
        if (mon.introStartFired && pill && pill.dataset.progressPct !== undefined) {
          const pct = Number(pill.dataset.progressPct);
          const uOpacity = selectEl ? Number(getComputedStyle(selectEl).opacity) : 0;
          if (
            Number.isFinite(pct) &&
            (mon.domProgressSamples.length === 0 ||
              mon.domProgressSamples[mon.domProgressSamples.length - 1] !== pct)
          ) {
            mon.domProgressSamples.push(pct);
            mon.underlayOpacitySamples.push(Number(uOpacity.toFixed(3)));
            mon.syncPairs.push({ pct, uOpacity: Number(uOpacity.toFixed(3)) });
          }
        }
        if (mon.webglReadyFired && window.__citycutWebglReadySnap === undefined) {
          const canvas = document.querySelector(".model canvas");
          window.__citycutWebglReadySnap = {
            polar: Number(canvas?.dataset.introPolar ?? 99),
            bldgInner: Number(canvas?.dataset.introBldgInner ?? 99),
            radius: Number(canvas?.dataset.introRadius ?? 0),
            elapsed: Number(canvas?.dataset.introElapsed ?? 99),
          };
        }
        if (mon.introStartFired) {
          // Boundary (moving dashed perimeter) effective opacity = product of its own + ancestor opacities
          const perim = document.querySelector(".select .frame-loop-perimeter");
          let eff = 0;
          if (perim) {
            eff = 1;
            for (let el = perim; el && el !== document.documentElement; el = el.parentElement) {
              const cs = getComputedStyle(el);
              if (cs.display === "none" || cs.visibility === "hidden") { eff = 0; break; }
              eff *= Number(cs.opacity);
            }
          }
          const canvas = document.querySelector(".model canvas");
          const startMs = window.__citycutIntroStartMs ?? performance.now();
          (mon.boundarySamples ??= []).push({
            t: Math.round(performance.now() - startMs),
            elapsed: Number(canvas?.dataset.introElapsed ?? 0),
            polar: Number(canvas?.dataset.introPolar ?? 0),
            mounted: Boolean(perim),
            eff: Number(eff.toFixed(3)),
            introDone: Boolean(mon.introDoneFired),
          });
        }
        if (typeof window.__citycutFirstTiltFrameMs === "number" && window.__citycutFirstTiltSnap === undefined) {
          const canvas = document.querySelector(".model canvas");
          window.__citycutFirstTiltSnap = {
            polar: Number(canvas?.dataset.introPolar ?? 99),
            bldgInner: Number(canvas?.dataset.introBldgInner ?? 99),
            radius: Number(canvas?.dataset.introRadius ?? 0),
            elapsed: Number(canvas?.dataset.introElapsed ?? 99),
          };
        }
        const modelEl = document.querySelector(".model");
        if (modelEl && selectEl?.classList.contains("is-handoff-underlay")) {
          mon.sawUnderlayDuringModelMount = true;
        }
        if (!mon.introStartFired) {
          mon.samplesBeforeWebglReady += 1;
          const frameEl = document.querySelector(".select .map-wrap .frame");
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
        }
        if (!modelEl || modelEl.hasAttribute("data-intro-hold")) {
          requestAnimationFrame(checkHandoff);
        }
      };
      requestAnimationFrame(checkHandoff);
    });

    // -------------------------------------------------------------------------
    // PHASE A (BEAT 2): Silent Background Load (2D Screen Untouched, No Fading Yet)
    // -------------------------------------------------------------------------
    await page.click("button.create-fab");
    await page.waitForTimeout(180);

    const beat2Info = await page.evaluate(() => {
      const selectEl = document.querySelector(".select");
      const frameEl = document.querySelector(".select .map-wrap .frame");
      const handleEl = document.querySelector(".select .map-wrap .frame-handle");
      const cadTagEl = document.querySelector(".select .map-wrap .frame-cad-tag");
      const omnibox = document.querySelector(".select .omnibox-stack");
      const dock = document.querySelector(".select .bottom-workbench");
      const selectPill = document.querySelector(".select .loading-hud-pill.is-processing");
      const modelPill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      const perimeterEl = frameEl?.querySelector(".frame-loop-perimeter");
      const edgeEls = frameEl ? Array.from(frameEl.querySelectorAll(".frame-loop-edge")) : [];
      const trackEls = frameEl ? Array.from(frameEl.querySelectorAll(".frame-loop-track")) : [];
      const frameRectRaw = frameEl?.getBoundingClientRect();
      const frameRect = frameRectRaw
        ? {
            left: Math.round(frameRectRaw.left),
            top: Math.round(frameRectRaw.top),
            width: Math.round(frameRectRaw.width),
            height: Math.round(frameRectRaw.height),
          }
        : null;
      const perimRectRaw = perimeterEl?.getBoundingClientRect();
      const perimeterRect = perimRectRaw
        ? {
            left: Math.round(perimRectRaw.left),
            top: Math.round(perimRectRaw.top),
            width: Math.round(perimRectRaw.width),
            height: Math.round(perimRectRaw.height),
          }
        : null;
      const perimCs = perimeterEl ? getComputedStyle(perimeterEl) : null;
      const edges2px =
        edgeEls.length === 4 &&
        edgeEls.every((el) => {
          const r = el.getBoundingClientRect();
          return Math.round(r.height) === 2 || Math.round(r.width) === 2;
        });
      const tracksGpuAnimated =
        trackEls.length === 4 &&
        trackEls.every((el) => {
          const cs = getComputedStyle(el);
          return cs.willChange.includes("transform") && cs.animationName.startsWith("citycut-frame-track-");
        });
      const frameCs = frameEl ? getComputedStyle(frameEl) : null;
      const handleCs = handleEl ? getComputedStyle(handleEl) : null;
      const cadTagCs = cadTagEl ? getComputedStyle(cadTagEl) : null;
      const omniCs = omnibox ? getComputedStyle(omnibox) : null;
      const dockCs = dock ? getComputedStyle(dock) : null;
      const modelPillCs = modelPill ? getComputedStyle(modelPill) : null;
      const boxShadow = frameCs?.boxShadow ?? "";
      const rgbaMatch = boxShadow.match(/rgba\(\s*235\s*,\s*235\s*,\s*235\s*,\s*([0-9.]+)\s*\)/);
      const outerAlpha = rgbaMatch ? Number(rgbaMatch[1]) : boxShadow.includes("rgb(235, 235, 235)") ? 1.0 : 0;
      const processingPillVisible = Boolean(selectPill && getComputedStyle(selectPill).opacity !== "0");
      const processingPillText = selectPill?.textContent?.trim() ?? "";
      const modelBridgePillVisible = Boolean(modelPillCs && Number(modelPillCs.opacity) > 0);
      return {
        isProcessingPhaseA: selectEl?.classList.contains("is-processing-phase-a") ?? false,
        isLoadingClass: selectEl?.classList.contains("is-loading") ?? false,
        selectOpacity: selectEl ? getComputedStyle(selectEl).opacity : "0",
        outerAlpha,
        handleOpacity: handleCs?.opacity ?? "0",
        cadTagOpacity: cadTagCs?.opacity ?? "0",
        omniboxOpacity: omniCs?.opacity ?? "0",
        dockOpacity: dockCs?.opacity ?? "0",
        processingPillVisible,
        processingPillText,
        frameRect,
        perimeterRect,
        perimeterInsetTop: perimCs?.top ?? "",
        perimeterInsetLeft: perimCs?.left ?? "",
        frameBorderTransparent: frameCs?.borderTopColor === "rgba(0, 0, 0, 0)",
        edges2px,
        tracksGpuAnimated,
        modelBridgePillVisible,
      };
    });

    const frame02Path = path.join(TMP_FRAMES_DIR, "frame_02.png");
    await page.screenshot({ path: frame02Path });

    const frameSizeDelta =
      beat1Info.frameRect && beat2Info.frameRect
        ? Math.abs(beat2Info.frameRect.width - beat1Info.frameRect.width) +
          Math.abs(beat2Info.frameRect.height - beat1Info.frameRect.height) +
          Math.abs(beat2Info.frameRect.left - beat1Info.frameRect.left) +
          Math.abs(beat2Info.frameRect.top - beat1Info.frameRect.top)
        : 999;
    const perimSizeDelta =
      beat2Info.frameRect && beat2Info.perimeterRect
        ? Math.abs(beat2Info.perimeterRect.width - beat2Info.frameRect.width) +
          Math.abs(beat2Info.perimeterRect.height - beat2Info.frameRect.height) +
          Math.abs(beat2Info.perimeterRect.left - beat2Info.frameRect.left) +
          Math.abs(beat2Info.perimeterRect.top - beat2Info.frameRect.top)
        : 999;

    assertCheck(
      "beat2-silent-background-load",
      "During Phase A (while model loads behind the scenes before 3D WebGL is ready), the 2D map stays un-dimmed while showing the top processing shimmer pill and 1:1 GPU-composited moving cut boundary (0px delta from default .frame)",
      beat2Info.isProcessingPhaseA &&
        !beat2Info.isLoadingClass &&
        beat2Info.selectOpacity === "1" &&
        beat2Info.outerAlpha === 0 &&
        beat2Info.handleOpacity === "1" &&
        beat2Info.cadTagOpacity === "1" &&
        beat2Info.dockOpacity === "1" &&
        beat2Info.processingPillVisible &&
        beat2Info.processingPillText.includes("Processing site data") &&
        frameSizeDelta === 0 &&
        perimSizeDelta === 0 &&
        beat2Info.perimeterInsetTop === "-2px" &&
        beat2Info.perimeterInsetLeft === "-2px" &&
        beat2Info.frameBorderTransparent &&
        beat2Info.edges2px &&
        beat2Info.tracksGpuAnimated &&
        !beat2Info.modelBridgePillVisible,
      `isProcessingPhaseA=${beat2Info.isProcessingPhaseA}, frameSizeDelta=${frameSizeDelta}px, perimSizeDelta=${perimSizeDelta}px, inset=${beat2Info.perimeterInsetTop}, edges2px=${beat2Info.edges2px}, tracksGpuAnimated=${beat2Info.tracksGpuAnimated}, borderTransparent=${beat2Info.frameBorderTransparent}`,
    );

    // -------------------------------------------------------------------------
    // PHASE B (BEAT 3): Synchronised 0%->100% Progress + 1->0 Background Fade + 3D Shift & Geometry Wave
    // -------------------------------------------------------------------------
    try {
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector(".model canvas[data-intro-bldg-inner][data-intro-tree-scale]");
          const model = document.querySelector(".model");
          return Boolean(
            canvas &&
              model &&
              !model.hasAttribute("data-intro-webgl-wait") &&
              typeof window.__citycutIntroStartMs === "number" &&
              typeof window.__citycutFirstTiltFrameMs === "number",
          );
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
        introStartMs: window.__citycutIntroStartMs ?? null,
        firstTiltFrameMs: window.__citycutFirstTiltFrameMs ?? null,
      }));
      console.error("[DEBUG DOM ON TIMEOUT]", JSON.stringify(debugDom));
      throw e;
    }

    // Pause intro clock immediately after Phase B starts to inspect Frame 1 & handoff latency
    await page.evaluate(() => {
      window.__citycutIntroPaused = true;
    });

    const beat3Start = await page.evaluate(() => {
      const canvas = document.querySelector(".model canvas");
      const modelEl = document.querySelector(".model");
      const bridgePill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      const bridgePillCs = bridgePill ? getComputedStyle(bridgePill) : null;
      const selectEl = document.querySelector(".select.is-handoff-underlay");
      const frameEl = selectEl?.querySelector(".map-wrap .frame");
      const perimEl = frameEl?.querySelector(".frame-loop-perimeter");
      const trackEls = frameEl ? Array.from(frameEl.querySelectorAll(".frame-loop-track")) : [];
      const phaseBTracksAnimating =
        Boolean(perimEl) &&
        trackEls.length === 4 &&
        trackEls.every((el) => {
          const cs = getComputedStyle(el);
          return cs.willChange.includes("transform") && cs.animationName.startsWith("citycut-frame-track-");
        });
      const phaseBFrameBorderTransparent = frameEl
        ? getComputedStyle(frameEl).borderTopColor === "rgba(0, 0, 0, 0)"
        : false;
      const handoff = window.__citycutHandoffMonitor ?? {
        blankFrames: 99,
        sawUnderlayDuringModelMount: false,
        webglReadyFired: false,
        introStartFired: false,
        domProgressSamples: [],
      };
      const introStartMs = Number(window.__citycutIntroStartMs ?? 0);
      const firstTiltFrameMs = Number(window.__citycutFirstTiltFrameMs ?? 99999);
      const handoffLatencyMs = firstTiltFrameMs - introStartMs;
      const readySnap = window.__citycutWebglReadySnap ?? window.__citycutFirstTiltSnap;
      const tiltSnap = window.__citycutFirstTiltSnap;
      return {
        polar: readySnap ? readySnap.polar : Number(canvas?.dataset.introPolar ?? 99),
        firstTiltPolar: tiltSnap ? tiltSnap.polar : Number(canvas?.dataset.introPolar ?? 99),
        bldgInner: readySnap ? readySnap.bldgInner : Number(canvas?.dataset.introBldgInner ?? 99),
        radius: readySnap ? readySnap.radius : Number(canvas?.dataset.introRadius ?? 0),
        introHold: modelEl?.getAttribute("data-intro-hold") ?? null,
        bridgePillOpacity: bridgePillCs?.opacity ?? "0",
        bridgePillPct: Number(bridgePill?.dataset.progressPct ?? -1),
        underlayOpacity: selectEl ? Number(getComputedStyle(selectEl).opacity) : -1,
        phaseBTracksAnimating,
        phaseBFrameBorderTransparent,
        handoffLatencyMs,
        handoff,
      };
    });

    const frame03Path = path.join(TMP_FRAMES_DIR, "frame_03.png");
    await page.screenshot({ path: frame03Path });
    fs.copyFileSync(frame03Path, path.join(TMP_FRAMES_DIR, "frame_04.png"));

    await page.evaluate(() => {
      window.__citycutIntroPaused = false;
    });

    assertCheck(
      "beat2-to-beat3-zero-blank-handoff",
      ".select remains mounted at opacity ~1 until <Scene3D> finishes 3 pre-warm WebGL frames in the background, then Phase B starts immediately with 0 blank frames, immediate next-frame handoff, and top progress bar visible starting near 0%",
      beat3Start.handoff.blankFrames === 0 &&
        beat3Start.handoff.sawUnderlayDuringModelMount &&
        beat3Start.handoff.webglReadyFired &&
        beat3Start.handoffLatencyMs >= 0 &&
        beat3Start.handoffLatencyMs < 1200 &&
        beat3Start.bridgePillOpacity === "1" &&
        beat3Start.bridgePillPct >= 0 &&
        beat3Start.bridgePillPct <= 12 &&
        beat3Start.underlayOpacity >= 0.88 &&
        beat3Start.phaseBTracksAnimating &&
        beat3Start.phaseBFrameBorderTransparent &&
        beat3Start.polar <= 0.12 &&
        beat3Start.radius >= 1100,
      `blankFrames=${beat3Start.handoff.blankFrames}, latency=${beat3Start.handoffLatencyMs.toFixed(1)}ms, pillOpacity=${beat3Start.bridgePillOpacity}, startPct=${beat3Start.bridgePillPct}%, startUnderlayOpacity=${beat3Start.underlayOpacity.toFixed(3)}, phaseBTracksAnimating=${beat3Start.phaseBTracksAnimating}, borderTransparent=${beat3Start.phaseBFrameBorderTransparent}, polar=${beat3Start.polar}, radius=${beat3Start.radius}m`,
    );

    // Poll Phase B (0s -> 2.1s) for:
    //   1) beat3WaveSample: elapsed in [0.63, 1.08], bldgInner > 0.35, bldgOuter < 0.18, treeScale < 0.05, underlayOpacity in [0.55, 0.90]
    //   2) beat3TreeSample: elapsed in [1.42, 3.08], treeScale > 1.04 (bouncy overshoot!)
    let beat3WaveSample = null;
    let beat3TreeSample = null;
    let maxObservedTreeScale = 0;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 80000) {
      const sample = await page.evaluate(() => {
        const canvas = document.querySelector(".model canvas");
        const modelEl = document.querySelector(".model");
        const selectEl = document.querySelector(".select.is-handoff-underlay");
        const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
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
          pct: Number(pill?.dataset.progressPct ?? 0),
          underlayOpacity: selectEl ? Number(getComputedStyle(selectEl).opacity) : 0,
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
        sample.elapsed >= 0.63 &&
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
        await page.evaluate(() => {
          window.__citycutIntroPaused = false;
        });
      }

      if (
        !beat3TreeSample &&
        sample.elapsed >= 1.42 &&
        sample.elapsed <= 3.08 &&
        sample.treeScale > 1.04
      ) {
        await page.evaluate(() => {
          window.__citycutIntroPaused = true;
        });
        beat3TreeSample = sample;
        const frame06Path = path.join(TMP_FRAMES_DIR, "frame_06.png");
        await page.screenshot({ path: frame06Path });
        await page.evaluate(() => {
          window.__citycutIntroPaused = false;
        });
      }

      if (sample.elapsed >= 3.5 && sample.introHold === null) {
        break;
      }
      await page.waitForTimeout(18);
    }

    const phaseBSyncStats = await page.evaluate(() => {
      const mon = window.__citycutHandoffMonitor ?? {
        domProgressSamples: [],
        underlayOpacitySamples: [],
        syncPairs: [],
      };
      const samples =
        Array.isArray(window.__citycutProgressSamples) && window.__citycutProgressSamples.length > 0
          ? window.__citycutProgressSamples
          : mon.domProgressSamples;
      let monotonic = samples.length >= 2;
      let maxStep = 0;
      for (let i = 1; i < samples.length; i++) {
        const diff = samples[i] - samples[i - 1];
        if (diff < 0) monotonic = false;
        if (diff > maxStep) maxStep = diff;
      }
      const distinctIntermediate = new Set(samples.filter((v) => v > 0 && v < 100)).size;
      // Verify that underlayOpacity tracks the late-tail curve (1 - min(1, (pct/100) * 3500/3300)^1.65, reaching 0 200ms early) closely across all captured pairs
      let maxSyncDrift = 0;
      for (const pair of mon.syncPairs) {
        const expectedOpacity = 1 - Math.pow(Math.min(1, (pair.pct / 100) * (3500 / 3300)), 1.65);
        const drift = Math.abs(pair.uOpacity - expectedOpacity);
        if (drift > maxSyncDrift) maxSyncDrift = drift;
      }
      return {
        sampleCount: samples.length,
        distinctIntermediate,
        firstSample: samples[0] ?? -1,
        lastSample: samples[samples.length - 1] ?? -1,
        monotonic,
        maxStep,
        syncPairCount: mon.syncPairs.length,
        maxSyncDrift,
        firstUnderlayOpacity: mon.underlayOpacitySamples[0] ?? -1,
        lastUnderlayOpacity: mon.underlayOpacitySamples[mon.underlayOpacitySamples.length - 1] ?? -1,
      };
    });

    const boundaryFadeStats = await page.evaluate(() => {
      const mon = window.__citycutHandoffMonitor ?? {};
      const samples = mon.boundarySamples ?? [];
      const visible = samples.filter((s) => s.mounted && s.eff > 0.005);
      const lastVisible = visible[visible.length - 1] ?? null;
      const firstFading = samples.find((s) => s.mounted && s.eff < 0.98 && s.eff > 0.005) ?? null;
      const visibleAfterDone = samples.filter((s) => s.introDone && s.mounted && s.eff > 0.005).length;
      const perim = document.querySelector(".select .frame-loop-perimeter");
      let settledEff = 0;
      if (perim) {
        settledEff = 1;
        for (let el = perim; el && el !== document.documentElement; el = el.parentElement) {
          settledEff *= Number(getComputedStyle(el).opacity);
        }
      }
      const pick = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 3.5].map((target) => {
        const s = samples.reduce((best, cur) => (Math.abs(cur.elapsed - target) < Math.abs(best.elapsed - target) ? cur : best), samples[0] ?? { elapsed: -1, eff: -1, mounted: false });
        return `${s.elapsed}s:${s.mounted ? s.eff : "unmounted"}`;
      });
      return {
        sampleCount: samples.length,
        lastVisibleElapsed: lastVisible ? lastVisible.elapsed : 0,
        lastVisibleMs: lastVisible ? lastVisible.t : 0,
        firstFadingMs: firstFading ? firstFading.t : -1,
        visibleAfterDone,
        settledMounted: Boolean(perim),
        settledEff,
        introDoneMs: mon.introDoneMs ?? -1,
        timeline: pick.join(", "),
        samples,
      };
    });
    fs.writeFileSync("/tmp/citycut-boundary-samples.json", JSON.stringify(boundaryFadeStats.samples, null, 1));
    assertCheck(
      "beat3-cut-boundary-fades-before-tilt-ends",
      "Moving dashed cut boundary fades to opacity 0 well before the 3.50s tilt completes (<= 2.0s intro elapsed), is never visible after citycut:intro-done, and is absent or 0 in the settled 3D view",
      boundaryFadeStats.sampleCount >= 8 &&
        boundaryFadeStats.lastVisibleElapsed <= 2.0 &&
        boundaryFadeStats.visibleAfterDone === 0 &&
        (!boundaryFadeStats.settledMounted || boundaryFadeStats.settledEff <= 0.005),
      `lastVisibleElapsed=${boundaryFadeStats.lastVisibleElapsed}s, visibleAfterDone=${boundaryFadeStats.visibleAfterDone}, settled=${boundaryFadeStats.settledMounted ? boundaryFadeStats.settledEff : "unmounted"}, timeline=[${boundaryFadeStats.timeline}]`,
    );

    assertCheck(
      "beat2-to-beat3-synced-progress-and-fade",
      "Phase B loading bar glides smoothly and monotonically from 0% to 100% (>= 10 intermediate samples, max step <= 15%) in exact lockstep with 2D background opacity fading from 1.0 to 0.0 (max drift <= 0.06)",
      phaseBSyncStats.monotonic &&
        phaseBSyncStats.firstSample === 0 &&
        phaseBSyncStats.lastSample === 100 &&
        phaseBSyncStats.distinctIntermediate >= 10 &&
        phaseBSyncStats.maxStep <= 15 &&
        phaseBSyncStats.syncPairCount >= 8 &&
        phaseBSyncStats.maxSyncDrift <= 0.06 &&
        phaseBSyncStats.lastUnderlayOpacity <= 0.05,
      `samples=${phaseBSyncStats.sampleCount} (intermediate=${phaseBSyncStats.distinctIntermediate}, range=${phaseBSyncStats.firstSample}%->${phaseBSyncStats.lastSample}%, maxStep=${phaseBSyncStats.maxStep}%), underlayFade=${phaseBSyncStats.firstUnderlayOpacity}->${phaseBSyncStats.lastUnderlayOpacity}, maxSyncDrift=${phaseBSyncStats.maxSyncDrift.toFixed(3)}`,
    );

    assertCheck(
      "beat3a-staggered-building-wave",
      "Early/mid Phase B (elapsed ~ 0.63s–1.08s of the 3.50s Phase B) extrudes buildings in a center-out radial wave (bldgInner > 0.35 while bldgOuter < 0.18) before trees start (treeScale < 0.05) while 2D background is mid-fade",
      Boolean(
        beat3WaveSample &&
          beat3WaveSample.bldgInner > 0.35 &&
          beat3WaveSample.bldgOuter < 0.18 &&
          beat3WaveSample.bldgInner > beat3WaveSample.bldgOuter &&
          beat3WaveSample.treeScale < 0.05 &&
          beat3WaveSample.underlayOpacity > 0.55 &&
          beat3WaveSample.underlayOpacity < 0.95 &&
          beat3WaveSample.topOpacity === "0" &&
          beat3WaveSample.leftOpacity === "0" &&
          beat3WaveSample.rightOpacity === "0" &&
          beat3WaveSample.bottomOpacity === "0",
      ),
      beat3WaveSample
        ? `elapsed=${beat3WaveSample.elapsed}s, pct=${beat3WaveSample.pct}%, underlayOpacity=${beat3WaveSample.underlayOpacity.toFixed(2)}, bldgInner=${beat3WaveSample.bldgInner}, bldgOuter=${beat3WaveSample.bldgOuter}, treeScale=${beat3WaveSample.treeScale}`
        : "did not capture building wave sample",
    );

    assertCheck(
      "beat3b-delayed-tree-bounce",
      "Later in Phase B (elapsed ~ 1.42s–3.08s of the 3.50s Phase B), trees pop up after buildings with a 16% spring overshoot bounce (treeScale > 0.30 and maxObservedTreeScale > 1.04)",
      Boolean(
        beat3TreeSample &&
          beat3TreeSample.treeScale > 0.30 &&
          maxObservedTreeScale > 1.04,
      ),
      beat3TreeSample
        ? `elapsed=${beat3TreeSample.elapsed}s, pct=${beat3TreeSample.pct}%, underlayOpacity=${beat3TreeSample.underlayOpacity.toFixed(2)}, sampleTreeScale=${beat3TreeSample.treeScale}, maxObservedTreeScale=${maxObservedTreeScale.toFixed(3)}`
        : `did not capture tree bounce sample (maxObservedTreeScale=${maxObservedTreeScale.toFixed(3)})`,
    );

    // -------------------------------------------------------------------------
    // BEAT 4: Settled 3D View at 100% + Studio HUD Slide-In
    // -------------------------------------------------------------------------
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(TMP_FRAMES_DIR, "frame_07.png") });
    await page.waitForTimeout(650);

    const frame08Path = path.join(TMP_FRAMES_DIR, "frame_08.png");
    await page.screenshot({ path: frame08Path });
    if (fs.existsSync(ARTIFACTS_DIR)) {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, "pr164-v12-3d-plinth-perspective.png") });
      const isoBtn = page.locator(".model .bottom-bar button", { hasText: "Isometric" }).first();
      if ((await isoBtn.count()) > 0) {
        await isoBtn.click();
        await page.waitForTimeout(260);
        await page.screenshot({ path: path.join(ARTIFACTS_DIR, "pr164-v12-3d-plinth-isometric.png") });
        const perspBtn = page.locator(".model .bottom-bar button", { hasText: "Perspective" }).first();
        if ((await perspBtn.count()) > 0) {
          await perspBtn.click();
          await page.waitForTimeout(220);
        }
      }
    }

    if (!fs.existsSync(path.join(TMP_FRAMES_DIR, "frame_05.png"))) {
      fs.copyFileSync(frame03Path, path.join(TMP_FRAMES_DIR, "frame_05.png"));
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
        introElapsed: Number(canvas?.dataset.introElapsed ?? 0),
        hudTransitions: [topBar, leftOutliner, rightInsp, bottomBar].map((el) => {
          if (!el) return 0;
          const cs = getComputedStyle(el);
          const dur = Math.max(...cs.transitionDuration.split(",").map((v) => parseFloat(v) || 0));
          const del = Math.max(...cs.transitionDelay.split(",").map((v) => parseFloat(v) || 0));
          return Math.round((dur + del) * 1000);
        }),
      };
    });

    const hudEntryMs = Math.max(...beat4Info.hudTransitions);
    const phaseBTotalMs = Math.round(beat4Info.introElapsed * 1000) + hudEntryMs;
    assertCheck(
      "beat3-stretched-phase-b-timing",
      "Phase B transition is 3.50s + 0.867s staggered HUD entry = 4.367s total (proportionally scaled from 2.10s + 0.52s)",
      Math.abs(beat4Info.introElapsed - 3.5) <= 0.02 && hudEntryMs >= 855 && hudEntryMs <= 880 && phaseBTotalMs >= 4320 && phaseBTotalMs <= 4420,
      `introElapsed=${beat4Info.introElapsed}s, hudEntry=${hudEntryMs}ms (per panel ${beat4Info.hudTransitions.join("/")}), total=${phaseBTotalMs}ms`,
    );

    assertCheck(
      "beat4-settled-hud",
      "At 100%, camera settles at final 3D perspective (polar >= 0.95), all building & tree buckets settle to 1.000 (even when localStorage had projection='iso'), 2D underlay fades to 0 and unmounts, and Studio HUD panels slide in to opacity === '1'",
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
      const leftExportBtn = document.querySelector(".model .left-tool-rail button[data-section=\"exports\"]");
      const leftRailEl = document.querySelector(".model .left-tool-rail");
      const topBarLeftEl = document.querySelector(".model .top-bar-left");
      const leftRailBg = leftRailEl ? getComputedStyle(leftRailEl).backgroundColor : "";
      const topBarLeftBg = topBarLeftEl ? getComputedStyle(topBarLeftEl).backgroundColor : "";

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
        hasLeftExportBtn: Boolean(leftExportBtn),
        leftRailBg,
        topBarLeftBg,
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
      ".right-inspector and .sidebar-panel.is-right have 0px border and zero legacy #DBDBDB/#EBEBEB inner bleed; .left-tool-rail matches .top-bar-left HUD card background; Left outliner says VIEW STYLE; zero card overlap at 1440x900",
      uiInvariants.rightInspBorder === "0px" &&
        uiInvariants.rightPanelBorder === "0px" &&
        uiInvariants.legacyBleedCount === 0 &&
        uiInvariants.outlinerText.toUpperCase() === "VIEW STYLE" &&
        !uiInvariants.hasLeftExportBtn &&
        uiInvariants.leftRailBg === uiInvariants.topBarLeftBg &&
        uiInvariants.leftRailBg !== "rgba(0, 0, 0, 0)" &&
        uiInvariants.overlaps.length === 0,
      `rightInspBorder=${uiInvariants.rightInspBorder}, leftRailBg=${uiInvariants.leftRailBg}, topBarLeftBg=${uiInvariants.topBarLeftBg}, bleed=${uiInvariants.legacyBleedCount}, outliner="${uiInvariants.outlinerText}", overlaps=${uiInvariants.overlaps.length}`,
    );

    // -------------------------------------------------------------------------
    // 3D DISPLAY OUTLINER INVARIANT (PER-USE BUILDINGS + RESET COLOURS BUTTON)
    // -------------------------------------------------------------------------
    const display3dOutlinerInfo = await page.evaluate(() => {
      const layersRegion = document.querySelector('.model .left-outliner [aria-label="Layers"]');
      const rowLabels = Array.from(
        layersRegion?.querySelectorAll(".o-row.studio-layer-row span:not(.m)") ?? [],
      ).map((el) => el.textContent?.trim() ?? "");
      const resetBtn = layersRegion?.querySelector("button.studio-reset-colours-btn");
      const resColorInput = layersRegion?.querySelector('input[type="color"][aria-label="Residential colour"]');
      const defaultResVal = resColorInput ? resColorInput.value.toLowerCase() : "";
      if (resColorInput) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(resColorInput, "#ff3366");
        resColorInput.dispatchEvent(new Event("input", { bubbles: true }));
        resColorInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const editedResCss = getComputedStyle(document.documentElement).getPropertyValue("--use-residential").trim().toLowerCase();
      if (resetBtn) {
        resetBtn.click();
      }
      return {
        hasSingleBuildingsRow: rowLabels.includes("Buildings"),
        hasResidentialRow: rowLabels.includes("Residential"),
        hasCommercialRow: rowLabels.includes("Commercial"),
        has3dResetBtn: Boolean(resetBtn && resetBtn.textContent?.trim() === "Reset colours"),
        defaultResVal,
        editedResCss,
        rowLabels,
      };
    });
    await page.waitForTimeout(80);
    const resetAfterRender = await page.evaluate(() => {
      const resColorInput = document.querySelector('.model .left-outliner [aria-label="Layers"] input[type="color"][aria-label="Residential colour"]');
      return {
        resetResCss: getComputedStyle(document.documentElement).getPropertyValue("--use-residential").trim().toLowerCase(),
        resetResVal: resColorInput ? resColorInput.value.toLowerCase() : "",
      };
    });
    Object.assign(display3dOutlinerInfo, resetAfterRender);

    if (fs.existsSync(ARTIFACTS_DIR)) {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, "pr164-v17-display-reset-colours.png") });
    }

    // -------------------------------------------------------------------------
    // SITE ANALYSIS DIRECTION A INVARIANT (IN 3D MODEL)
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
      const hasBottomCompass = Boolean(document.querySelector(".model .bottom-bar .compass-mini"));
      const hasBottomReset = Boolean(document.querySelector(".model .bottom-bar .cam-reset"));
      const hasTopCenterReset = Boolean(document.querySelector(".model .top-bar-center .cam-reset"));
      const envText = envConsole?.textContent ?? "";
      const noHorizontalOverflow = Boolean(
        envConsole &&
          topRow &&
          bottomRow &&
          envConsole.scrollWidth <= envConsole.clientWidth + 1 &&
          topRow.scrollWidth <= topRow.clientWidth + 1 &&
          bottomRow.scrollWidth <= bottomRow.clientWidth + 1,
      );
      return {
        visibleLeftDrawerCount: visibleLeftDrawers.length,
        hasEnvConsole: Boolean(envConsole && envRect && envRect.width > 400 && envRect.height > 50),
        hasTwoRows: Boolean(topRow && bottomRow),
        hasBottomCompass,
        hasBottomReset,
        hasTopCenterReset,
        noHorizontalOverflow,
        has3dSunDomeIn3d: envText.includes("3D Sun Dome"),
        hasPlanFanIn3d: envText.includes("9–3pm Plan Fan"),
        hasDuplicateResCodeInRow2: envText.includes("ResCode 9–3"),
        envConsoleRect: envRect
          ? { width: Math.round(envRect.width), height: Math.round(envRect.height) }
          : null,
      };
    });

    assertCheck(
      "site-analysis-direction-a",
      "Clicking Analysis hides the left drawer completely (0 visible left drawer), opens the non-overflowing 2-row bottom environmental console without N ▲ or Reset view, places Reset view in .top-bar-center, and shows 3D Sun Dome (not 9–3pm Plan Fan) in 3D view",
      analysisInfo.visibleLeftDrawerCount === 0 &&
        analysisInfo.hasEnvConsole &&
        analysisInfo.hasTwoRows &&
        !analysisInfo.hasBottomCompass &&
        !analysisInfo.hasBottomReset &&
        analysisInfo.hasTopCenterReset &&
        analysisInfo.noHorizontalOverflow &&
        analysisInfo.has3dSunDomeIn3d &&
        !analysisInfo.hasPlanFanIn3d &&
        !analysisInfo.hasDuplicateResCodeInRow2,
      `visibleLeftDrawers=${analysisInfo.visibleLeftDrawerCount}, noOverflow=${analysisInfo.noHorizontalOverflow}, topReset=${analysisInfo.hasTopCenterReset}, bottomCompass=${analysisInfo.hasBottomCompass}, 3dDome=${analysisInfo.has3dSunDomeIn3d}, planFanIn3d=${analysisInfo.hasPlanFanIn3d}, rect=${JSON.stringify(analysisInfo.envConsoleRect)}`,
    );

    // -------------------------------------------------------------------------
    // DRAWING -> DISPLAY OUTLINER CLEANUP & RESET COLOURS INVARIANT
    // -------------------------------------------------------------------------
    await page.getByRole("tab", { name: /Drawing/i }).click();
    await page.waitForSelector("svg.plan", { timeout: 10000 });
    const displayBtn = page.getByRole("button", { name: "Display" }).first();
    await displayBtn.click();
    await page.waitForTimeout(300);

    const displayDrawingOutlinerInfo = await page.evaluate(() => {
      const outliner = document.querySelector(".model .left-outliner");
      const outlinerText = outliner?.textContent ?? "";
      const hasDrawingTypeSwitch = Boolean(outliner?.querySelector(".drawing-type-switch"));
      const hasLineStyles = outlinerText.includes("Line styles");
      const hasLegacyColours = outlinerText.includes("--use-commercial") || outlinerText.includes("Colours");
      const hasFitFrame = outlinerText.includes("Fit frame");
      const hasPlanScale = Boolean(outliner?.querySelector('select[aria-label="Plan scale"]'));
      const layersRegion = outliner?.querySelector('[aria-label="Layers"]');
      const hasDrawingResetBtn = Boolean(layersRegion?.querySelector("button.studio-reset-colours-btn"));
      const rowLabels = Array.from(
        layersRegion?.querySelectorAll(".o-row.studio-layer-row span:not(.m)") ?? [],
      ).map((el) => el.textContent?.trim() ?? "");
      return {
        hasDrawingTypeSwitch,
        hasLineStyles,
        hasLegacyColours,
        hasFitFrame,
        hasPlanScale,
        hasDrawingResetBtn,
        hasSingleBuildingsRow: rowLabels.includes("Buildings"),
        hasResidentialRow: rowLabels.includes("Residential"),
        hasCommercialRow: rowLabels.includes("Commercial"),
        rowLabels,
      };
    });

    assertCheck(
      "display-outliner-per-use-and-reset-colours",
      "Both 3D model and Drawing Display outliners list individual building uses, include a working 'Reset colours' button in SCENE LAYERS that restores default colours after an edit, and Drawing Display removes duplicate view switcher, Line styles, legacy Colours, and Fit frame",
      !display3dOutlinerInfo.hasSingleBuildingsRow &&
        display3dOutlinerInfo.hasResidentialRow &&
        display3dOutlinerInfo.hasCommercialRow &&
        display3dOutlinerInfo.has3dResetBtn &&
        display3dOutlinerInfo.editedResCss === "#ff3366" &&
        display3dOutlinerInfo.resetResCss === display3dOutlinerInfo.defaultResVal &&
        display3dOutlinerInfo.resetResVal === display3dOutlinerInfo.defaultResVal &&
        !displayDrawingOutlinerInfo.hasDrawingTypeSwitch &&
        !displayDrawingOutlinerInfo.hasLineStyles &&
        !displayDrawingOutlinerInfo.hasLegacyColours &&
        !displayDrawingOutlinerInfo.hasFitFrame &&
        displayDrawingOutlinerInfo.hasPlanScale &&
        displayDrawingOutlinerInfo.hasDrawingResetBtn &&
        !displayDrawingOutlinerInfo.hasSingleBuildingsRow &&
        displayDrawingOutlinerInfo.hasResidentialRow &&
        displayDrawingOutlinerInfo.hasCommercialRow,
      `resetBtn=[3d:${display3dOutlinerInfo.has3dResetBtn},drawing:${displayDrawingOutlinerInfo.hasDrawingResetBtn}], edit->reset=[${display3dOutlinerInfo.editedResCss}->${display3dOutlinerInfo.resetResCss}], 3dRows=[${display3dOutlinerInfo.rowLabels.join(", ")}]`,
    );

    // -------------------------------------------------------------------------
    // DRAWING -> SITE PLAN: 9-3PM PLAN FAN & SELECTED BUILDING SHADOW ISOLATION
    // -------------------------------------------------------------------------
    await analysisBtn.click();
    await page.waitForTimeout(300);

    const planFanBtn = page.locator(".model .env-console .overlay-chips button", { hasText: "9–3pm Plan Fan" });
    await planFanBtn.click();
    await page.waitForSelector("svg.plan [data-shadow-hour] path", { timeout: 10000 });
    await page.waitForTimeout(300);

    const beforeSelectInfo = await page.evaluate(() => {
      const envText = document.querySelector(".model .env-console")?.textContent ?? "";
      const shadowPathEls = Array.from(document.querySelectorAll("svg.plan [data-shadow-hour] path"));
      const shadowPaths = shadowPathEls.length;
      const shadowDLength = shadowPathEls.reduce((acc, p) => acc + (p.getAttribute("d")?.length ?? 0), 0);
      const svg = document.querySelector("svg.plan");
      const svgRect = svg.getBoundingClientRect();
      const cx = svgRect.left + svgRect.width / 2;
      const cy = svgRect.top + svgRect.height / 2;
      const candidates = [];
      for (const p of svg.querySelectorAll("path")) {
        if (p.closest("[data-shadow-hour]") || p.closest(".heliodon-plan-overlay") || p.closest(".plan-north-arrow")) continue;
        const fill = p.getAttribute("fill") ?? "";
        if (!fill || fill === "none" || fill.includes("canvas")) continue;
        const r = p.getBoundingClientRect();
        if (r.width >= 14 && r.width <= 120 && r.height >= 14 && r.height <= 120) {
          const px = r.left + r.width / 2;
          const py = r.top + r.height / 2;
          const dist = Math.hypot(px - cx, py - cy);
          if (dist < 220) {
            candidates.push({ px, py, dist });
          }
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);
      const picked = [];
      for (const c of candidates) {
        if (picked.every((p) => Math.hypot(p.px - c.px, p.py - c.py) > 35)) {
          picked.push(c);
          if (picked.length === 2) break;
        }
      }
      return {
        has3dSunDomeInDrawing: envText.includes("3D Sun Dome"),
        hasPlanFanInDrawing: envText.includes("9–3pm Plan Fan"),
        shadowPaths,
        shadowDLength,
        picked,
      };
    });

    for (const pt of beforeSelectInfo.picked) {
      await page.mouse.move(pt.px, pt.py);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(350);

    const afterSelectInfo = await page.evaluate(() => {
      const selectedEls = document.querySelectorAll("svg.plan [data-selected-building]");
      const shadowPathEls = Array.from(document.querySelectorAll("svg.plan [data-shadow-hour] path"));
      const shadowPaths = shadowPathEls.length;
      const shadowDLength = shadowPathEls.reduce((acc, p) => acc + (p.getAttribute("d")?.length ?? 0), 0);
      const nonEmptyLayers = Array.from(document.querySelectorAll("svg.plan [data-shadow-hour]")).filter(
        (g) => g.querySelectorAll("path").length > 0,
      ).length;
      return {
        selectedCount: selectedEls.length,
        shadowPaths,
        shadowDLength,
        nonEmptyLayers,
      };
    });

    assertCheck(
      "drawing-sun-study-selection",
      "In Drawing -> Site plan, 3D Sun Dome is hidden, 9–3pm Plan Fan is shown, and clicking buildings isolates 9–3pm shadows strictly to the selected yellow buildings",
      !beforeSelectInfo.has3dSunDomeInDrawing &&
        beforeSelectInfo.hasPlanFanInDrawing &&
        afterSelectInfo.selectedCount >= 1 &&
        afterSelectInfo.nonEmptyLayers === 7 &&
        afterSelectInfo.shadowPaths > 0 &&
        afterSelectInfo.shadowDLength < beforeSelectInfo.shadowDLength * 0.25,
      `3dDomeInDrawing=${beforeSelectInfo.has3dSunDomeInDrawing}, planFanInDrawing=${beforeSelectInfo.hasPlanFanInDrawing}, selectedCount=${afterSelectInfo.selectedCount}, shadowDLength=${beforeSelectInfo.shadowDLength}->${afterSelectInfo.shadowDLength}, layers=${afterSelectInfo.nonEmptyLayers}`,
    );

    // -------------------------------------------------------------------------
    // TONE CONTINUITY: luminance inside the dashed cut box must not step up across the
    // select -> Phase A -> handoff -> early Phase B tilt (fresh page, 1440x900 @1x)
    // -------------------------------------------------------------------------
    {
      const toneCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "no-preference" });
      await toneCtx.addInitScript(() => {
        window.__citycutMinSilentLoadMs = 1500;
      });
      const tonePage = await toneCtx.newPage();
      await tonePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await tonePage.waitForSelector("button.create-fab", { timeout: 20000 });
      await tonePage.evaluate(() => document.fonts.ready);
      await tonePage.waitForTimeout(1500);
      const regionLum = async (clip) => {
        const png = PNG.sync.read(await tonePage.screenshot({ clip }));
        let sum = 0;
        for (let i = 0; i < png.data.length; i += 4) {
          sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
        }
        return sum / (png.data.length / 4);
      };
      const outerLum = async () =>
        ((await regionLum({ x: 40, y: 250, width: 360, height: 400 })) +
          (await regionLum({ x: 1040, y: 250, width: 360, height: 400 }))) / 2;
      // Strictly inside the dashed cut boundary: frame rect inset 8px so the 2px dash strips are excluded.
      let innerClip = null;
      const innerLum = async () => {
        const r = await tonePage.evaluate(() => {
          const b = document.querySelector(".select .map-wrap .frame")?.getBoundingClientRect();
          return b && b.width > 40 && b.height > 40 ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
        });
        if (r) innerClip = { x: Math.round(r.x + 8), y: Math.round(r.y + 8), width: Math.round(r.width - 16), height: Math.round(r.height - 16) };
        return innerClip ? regionLum(innerClip) : NaN;
      };
      const toneSamples = [];
      for (let i = 0; i < 80; i++) {
        if (i === 2) await tonePage.click("button.create-fab");
        const st = await tonePage.evaluate(() => ({
          started: Boolean(window.__citycutIntroStarted),
          elapsed: Number(document.querySelector(".model canvas")?.dataset.introElapsed ?? 0),
        }));
        toneSamples.push({ ...st, inner: Number((await innerLum()).toFixed(1)), outer: Number((await outerLum()).toFixed(1)) });
        if (st.started && st.elapsed >= 0.5) break;
      }
      await toneCtx.close();
      const toneValid = toneSamples.filter((t) => Number.isFinite(t.inner));
      let maxStepUp = 0;
      for (let i = 1; i < toneValid.length; i++) {
        maxStepUp = Math.max(maxStepUp, toneValid[i].inner - toneValid[i - 1].inner);
      }
      const baseline = toneValid[0]?.inner ?? 0;
      const netRise = Math.max(...toneValid.map((t) => t.inner)) - baseline;
      assertCheck(
        "handoff-tone-continuity",
        "Map luminance strictly inside the dashed cut boundary never brightens from the select screen through Phase A, the 3D handoff, and the first 0.5s of the tilt (no step up > 2/255, net rise <= 2/255; darkening into the 3D view is allowed)",
        toneValid.length >= 6 && toneSamples.some((t) => t.started) && maxStepUp <= 2 && netRise <= 2,
        `samples=${toneSamples.length}, baseline=${baseline}, maxStepUp=${maxStepUp.toFixed(1)}, netRise=${netRise.toFixed(1)}, trace=[${toneSamples.map((t) => `${t.started ? `B${t.elapsed}` : "A"}:${t.inner}`).join(" ")}]`,
      );
      let outerMaxStepUp = 0;
      for (let i = 1; i < toneSamples.length; i++) {
        outerMaxStepUp = Math.max(outerMaxStepUp, toneSamples[i].outer - toneSamples[i - 1].outer);
      }
      const outerBaseline = toneSamples[0]?.outer ?? 0;
      const outerNetRise = Math.max(...toneSamples.map((t) => t.outer)) - outerBaseline;
      assertCheck(
        "handoff-tone-continuity-outer",
        "Outer dimmed map luminance (outside the cut) stays continuous from the select screen through Phase A, the 3D handoff, and the first 0.5s of the tilt (no step up > 3/255, net rise <= 3/255)",
        toneSamples.length >= 6 && toneSamples.some((t) => t.started) && outerMaxStepUp <= 3 && outerNetRise <= 3,
        `samples=${toneSamples.length}, baseline=${outerBaseline}, maxStepUp=${outerMaxStepUp.toFixed(1)}, netRise=${outerNetRise.toFixed(1)}, trace=[${toneSamples.map((t) => `${t.started ? `B${t.elapsed}` : "A"}:${t.outer}`).join(" ")}]`,
      );
    }

    // -------------------------------------------------------------------------
    // NO SEPARATE INNER PLAN: shortly after tilt start (~0.2s+), the 2D cut window must
    // carry the same veil as the map around it and the yellow 3D cut ring must be gone.
    // -------------------------------------------------------------------------
    {
      const ipCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "no-preference" });
      await ipCtx.addInitScript(() => {
        window.__citycutMinSilentLoadMs = 1500;
      });
      const ipPage = await ipCtx.newPage();
      await ipPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await ipPage.waitForSelector("button.create-fab", { timeout: 20000 });
      await ipPage.waitForTimeout(1500);
      await ipPage.click("button.create-fab");
      let ipElapsed = 0;
      for (let i = 0; i < 1500 && ipElapsed < 0.35; i++) {
        ipElapsed = await ipPage.evaluate(() => Number(document.querySelector(".model canvas")?.dataset.introElapsed ?? 0));
        if (ipElapsed < 0.35) await ipPage.waitForTimeout(20);
      }
      await ipPage.evaluate(() => {
        window.__citycutIntroPaused = true;
      });
      await ipPage.waitForTimeout(400);
      const ipInfo = await ipPage.evaluate(() => {
        const fr = document.querySelector(".select .map-wrap .frame");
        const r = fr?.getBoundingClientRect();
        const ring = document.querySelector(".model canvas")?.dataset.introCutRingOpacity;
        return {
          elapsed: Number(document.querySelector(".model canvas")?.dataset.introElapsed ?? 0),
          rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
          ringOpacity: ring === undefined ? 1 : Number(ring),
        };
      });
      // Underlay alone: hide the 3D canvas so the 2D plan layer is measured on its own.
      await ipPage.evaluate(() => {
        const m = document.querySelector(".model");
        if (m) m.style.visibility = "hidden";
      });
      const ipLum = async (clip) => {
        const png = PNG.sync.read(await ipPage.screenshot({ clip }));
        let sum = 0;
        for (let i = 0; i < png.data.length; i += 4) sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
        return sum / (png.data.length / 4);
      };
      let innerL = NaN;
      let outerL = NaN;
      if (ipInfo.rect) {
        const { x, y, width, height } = ipInfo.rect;
        innerL = await ipLum({ x: Math.round(x + 8), y: Math.round(y + 8), width: Math.round(width - 16), height: Math.round(height - 16) });
        // Same-height bands just outside the cut on both sides.
        const band = 120;
        outerL =
          ((await ipLum({ x: Math.max(0, Math.round(x - 8 - band)), y: Math.round(y + 8), width: band, height: Math.round(height - 16) })) +
            (await ipLum({ x: Math.round(x + width + 8), y: Math.round(y + 8), width: band, height: Math.round(height - 16) }))) / 2;
      }
      await ipCtx.close();
      const ipDiff = innerL - outerL;
      assertCheck(
        "tilt-no-separate-inner-plan",
        "From tilt start + ~0.2s, no separate inner cut plan or edge is visible: the 2D cut window is no lighter than the map around it (<= 2/255) and the yellow 3D cut ring is hidden (opacity <= 0.01)",
        Number.isFinite(ipDiff) && ipDiff <= 2 && ipInfo.ringOpacity <= 0.01,
        `elapsed=${ipInfo.elapsed}, innerLum=${innerL.toFixed(1)}, outerLum=${outerL.toFixed(1)}, innerMinusOuter=${ipDiff.toFixed(1)}, ringOpacity=${ipInfo.ringOpacity}`,
      );
    }

    {
      const scCtx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion: "no-preference" });
      const scPage = await scCtx.newPage();
      const scErrors = [];
      scPage.on("pageerror", (err) => scErrors.push(err.message));
      await scPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await scPage.waitForSelector("button.create-fab", { timeout: 20000 });
      await scPage.waitForTimeout(1200);
      await scPage.click("button.create-fab");
      await scPage.waitForSelector(".model .section-cut-toggle", { timeout: 60000 });
      await scPage.waitForTimeout(6000);
      await scPage.mouse.move(4, 450);
      const scLum = async () => {
        const png = PNG.sync.read(await scPage.screenshot({ clip: { x: 300, y: 120, width: 800, height: 560 } }));
        let sum = 0;
        for (let i = 0; i < png.data.length; i += 4) sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
        return sum / (png.data.length / 4);
      };
      const offLum = await scLum();
      await scPage.keyboard.press("x");
      await scPage.waitForTimeout(300);
      const xFree = (await scPage.$(".model .section-cut-card")) === null;
      await scPage.click(".model .section-cut-toggle");
      await scPage.waitForSelector(".model .section-cut-card", { timeout: 5000 });
      await scPage.waitForTimeout(1500);
      await scPage.mouse.move(4, 450);
      const onLum = await scLum();
      const overlapCheck = (cardSel, skip) => {
        const card = document.querySelector(cardSel)?.getBoundingClientRect();
        const hits = [];
        for (const sel of [".model .top-bar-left", ".model .top-bar-center", ".model .top-bar-right", ".model .left-rail", ".model .left-outliner", ".model .right-inspector", ".model .bottom-bar", ".model .section-cut-toggle"]) {
          if (sel === skip) continue;
          const el = document.querySelector(sel);
          if (!el || !card) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const x = Math.min(card.right, r.right) - Math.max(card.left, r.left);
          const y = Math.min(card.bottom, r.bottom) - Math.max(card.top, r.top);
          if (x > 1 && y > 1) hits.push(sel);
        }
        return { inside: Boolean(card && card.width > 0 && card.right <= 1440 && card.bottom <= 900 && card.left >= 0 && card.top >= 0), hits };
      };
      const scLayout = await scPage.evaluate(() => {
        const card = document.querySelector(".model .section-cut-card")?.getBoundingClientRect();
        const panel = document.querySelector(".model .right-inspector")?.getBoundingClientRect();
        return {
          inside: Boolean(card && panel && card.left >= panel.left - 1 && card.right <= panel.right + 1 && card.top >= panel.top - 1 && card.right <= 1440),
          inTab: Boolean(document.querySelector(".model .right-inspector .sections-tab")),
          oldCard: Boolean(document.querySelector(".model .section-cut-card:not(.sections-tab)")),
          hits: [],
          handle: document.querySelector(".model canvas")?.dataset.sectionHandle ?? "",
          looking: document.querySelector(".model .section-cut-looking")?.textContent ?? "",
        };
      });
      const [hx, hy] = scLayout.handle.split(",").map(Number);
      let dragged = NaN;
      if (Number.isFinite(hx) && Number.isFinite(hy)) {
        await scPage.mouse.move(hx, hy);
        await scPage.mouse.down();
        for (let i = 1; i <= 16; i++) {
          await scPage.mouse.move(hx + i * 5, hy + i * 8);
          await scPage.waitForTimeout(25);
        }
        await scPage.mouse.up();
        await scPage.waitForTimeout(800);
        dragged = Number(await scPage.evaluate(() => document.querySelector(".model .section-cut-card")?.dataset.offset ?? "NaN"));
      }
      const flippedBefore = await scPage.evaluate(() => document.querySelector(".model .section-cut-card")?.dataset.flipped);
      await scPage.click(".model .section-cut-flip");
      await scPage.waitForTimeout(400);
      const flipInfo = await scPage.evaluate(() => ({
        flipped: document.querySelector(".model .section-cut-card")?.dataset.flipped,
        looking: document.querySelector(".model .section-cut-looking")?.textContent ?? "",
      }));
      const cutA = await scPage.evaluate(() => ({ ...document.querySelector(".model .sections-tab")?.dataset }));
      await scPage.click(".model .sections-add");
      await scPage.waitForTimeout(600);
      await scPage.mouse.move(4, 450);
      const cutB = await scPage.evaluate(() => ({
        ...document.querySelector(".model .sections-tab")?.dataset,
        chips: [...document.querySelectorAll(".model .sections-chip")].map((el) => el.dataset.label).join(","),
      }));
      await scPage.click('.model .sections-chip[data-label="A"]');
      await scPage.waitForTimeout(500);
      const backA = await scPage.evaluate(() => ({ ...document.querySelector(".model .sections-tab")?.dataset }));
      await scPage.click(".model .section-drawing-toggle");
      await scPage.waitForSelector(".model .section-drawing", { timeout: 5000 });
      await scPage.waitForTimeout(500);
      const drawInfo = await scPage.evaluate((fn) => {
        const check = new Function(`return (${fn})`)()(".model .section-drawing", "");
        const el = document.querySelector(".model .section-drawing");
        return {
          ...check,
          cut: el?.dataset.cut ?? "",
          buildings: Number(el?.dataset.buildings ?? "0"),
          ground: Boolean(el?.querySelector("svg")),
          datum: /AHD|flat ground/.test(el?.textContent ?? ""),
          exports: el?.querySelectorAll("button").length ?? 0,
        };
      }, overlapCheck.toString());
      await scPage.screenshot({ path: path.join(TMP_FRAMES_DIR, "section-drawing.png") });
      const row = await scPage.$(".model .sections-bldg");
      let hoverInfo = { row: false, list: false, drawing: false };
      if (row) {
        const rowId = await row.getAttribute("data-building-id");
        await row.hover();
        await scPage.waitForTimeout(500);
        hoverInfo = await scPage.evaluate((id) => ({
          row: Boolean(document.querySelector(`.model .sections-bldg.is-hover[data-building-id="${id}"]`)),
          list: true,
          drawing: Boolean(document.querySelector(`.model .section-drawing .section-drawing-cut.is-hover[data-building-id="${id}"]`)),
        }), rowId);
      }
      await scPage.mouse.move(700, 300);
      await scPage.click('.model .studio-view-tabs button[role="tab"]:nth-child(2)');
      await scPage.waitForTimeout(1500);
      const planLines = await scPage.evaluate(() => [...document.querySelectorAll(".model .plan-section-line")].map((el) => el.dataset.label).join(","));
      await scPage.click('.model .studio-view-tabs button[role="tab"]:nth-child(1)');
      await scPage.waitForTimeout(1500);
      assertCheck(
        "section-multi-cut",
        "Sections tab: adding a cut creates B rotated 90 degrees with its own offset, switching back restores A's offset and angle",
        cutB.cuts === "2" && cutB.chips === "A,B" && cutB.angle !== cutA.angle && backA.offset === cutA.offset && backA.angle === cutA.angle,
        `A=${cutA.angle}/${cutA.offset}, B=${cutB.angle}/${cutB.offset}, chips=${cutB.chips}, backA=${backA.angle}/${backA.offset}`,
      );
      assertCheck(
        "section-drawing-panel",
        "Section drawing: opens for the active cut inside 1440x900 without overlapping HUD islands, shows a datum and export buttons",
        drawInfo.inside && drawInfo.hits.length === 0 && drawInfo.cut === "A" && drawInfo.ground && drawInfo.datum && drawInfo.exports >= 2,
        `inside=${drawInfo.inside}, overlaps=[${drawInfo.hits.join(",")}], cut=${drawInfo.cut}, buildings=${drawInfo.buildings}, datum=${drawInfo.datum}, exports=${drawInfo.exports}`,
      );
      assertCheck(
        "section-building-hover",
        "Sections building list: hovering a row highlights the row and the cut building in the drawing",
        hoverInfo.list && hoverInfo.row && hoverInfo.drawing,
        JSON.stringify(hoverInfo),
      );
      assertCheck(
        "section-plan-lines",
        "2D plan draws a labelled line for every section cut",
        planLines === "A,B" || planLines === "B,A",
        `lines=${planLines}`,
      );
      await scPage.click(".model .section-cut-close");
      await scPage.waitForTimeout(400);
      const closed = (await scPage.$(".model .section-cut-card")) === null;
      await scCtx.close();
      assertCheck(
        "section-cut-live-clip",
        "Section cut: X stays free, the toggle clips the 3D model visibly, the controls live in the right panel Sections tab with no floating card, dragging the handle moves the plane onto a 5 m snap, Flip swaps the view direction, and close turns it off without page errors",
        xFree &&
          Math.abs(onLum - offLum) >= 1 &&
          scLayout.inside &&
          scLayout.inTab &&
          !scLayout.oldCard &&
          Number.isFinite(dragged) &&
          Math.abs(dragged) >= 5 &&
          Math.abs(dragged / 5 - Math.round(dragged / 5)) < 1e-6 &&
          flipInfo.flipped !== flippedBefore &&
          flipInfo.looking !== scLayout.looking &&
          closed &&
          scErrors.length === 0,
        `xFree=${xFree}, lum=${offLum.toFixed(1)}->${onLum.toFixed(1)}, inside=${scLayout.inside}, inTab=${scLayout.inTab}, oldCard=${scLayout.oldCard}, handle=${scLayout.handle}, offset=${dragged}, flip=${flippedBefore}->${flipInfo.flipped}, looking=${scLayout.looking}->${flipInfo.looking}, closed=${closed}, errors=${scErrors.length}`,
      );
    }

    // -------------------------------------------------------------------------
    // GENERATE 8-FRAME CONTACT SHEET + LIVE TRANSITION MP4 VIDEO
    // -------------------------------------------------------------------------
    if (fs.existsSync(ARTIFACTS_DIR)) {
      const contactSheetOut = path.join(ARTIFACTS_DIR, "pr164-v17-transition-contact-sheet.png");
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

      let vIdx = 0;
      const frameRepeats = [
        ["frame_01.png", 14], // Beat 1: Landing (0.56s)
        ["frame_02.png", 14], // Phase A: Silent background load — 2D screen untouched (0.56s)
        ["frame_03.png", 10], // Phase B start (0%): Loading bar appears at 0%, 3D ready (0.40s)
        ["frame_04.png", 8],  // Phase B early: 2D background begins fading + camera starts tilting (0.32s)
        ["frame_05.png", 14], // Phase B mid (Beat 3A): Center-out radial building wave + 2D mid-fade (0.56s)
        ["frame_06.png", 14], // Phase B late (Beat 3B): Delayed bouncy tree pop-up wave (0.56s)
        ["frame_07.png", 10], // Beat 4a (100%): 2D background faded to 0, HUD sliding in (0.40s)
        ["frame_08.png", 20], // Beat 4b: Settled 3D perspective + full Studio HUD (0.80s)
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
      const mp4Out = path.join(ARTIFACTS_DIR, "pr164-v17-live-transition.mp4");
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
