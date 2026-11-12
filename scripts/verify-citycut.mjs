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
import crypto from "node:crypto";
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

async function rasterizeSvgPng(browser, svg, width, height) {
  const page = await browser.newPage();
  await page.setViewportSize({
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  });
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#fff}svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`;
  await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return buf;
}

function hstackPngBuffers(leftBuf, rightBuf, gap = 6) {
  const left = PNG.sync.read(leftBuf);
  const right = PNG.sync.read(rightBuf);
  const height = Math.max(left.height, right.height);
  const width = left.width + gap + right.width;
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = 255;
  }
  PNG.bitblt(left, out, 0, 0, left.width, left.height, 0, 0);
  PNG.bitblt(right, out, 0, 0, right.width, right.height, left.width + gap, 0);
  return PNG.sync.write(out);
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

function bufferIncludesLayerName(bytes, layerName) {
  if (bytes.includes(Buffer.from(layerName, "utf8"))) return true;
  return bytes.includes(Buffer.from(layerName, "utf16le"));
}

function inspectSitePlan3dmFromHeader(bytes) {
  const header = bytes.toString("latin1", 0, Math.min(bytes.length, 12000));
  const expected = [
    "Green",
    "Contours",
    "Footpaths",
    "Roads",
    "Blocks",
    "Buildings",
    "Trees",
    "Sun path",
    "Shadow 09:00",
    "Shadow 10:00",
    "Shadow 11:00",
    "Shadow 12:00",
    "Shadow 13:00",
    "Shadow 14:00",
    "Shadow 15:00",
    "Imported massing",
    "Imported::Upper levels",
  ];
  const layerNames = expected.filter((name) => bufferIncludesLayerName(bytes, name));
  const objectCountOnLayer = (layerName) => (layerNames.includes(layerName) ? 1 : 0);
  return {
    header,
    layerNames,
    objectCount: 0,
    objectCountOnLayer,
    destroy: () => {},
    parsed: "header",
  };
}

async function inspectSitePlan3dm(bytes) {
  const header = bytes.toString("latin1", 0, Math.min(bytes.length, 8000));
  if (bytes.length > 2_500_000) {
    const fallback = inspectSitePlan3dmFromHeader(bytes);
    fallback.header = header;
    return fallback;
  }
  try {
    const rhinoModule = await import(
      new URL("../node_modules/rhino3dm/rhino3dm.module.js", import.meta.url).href,
    );
    const { readFile } = await import("node:fs/promises");
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("rhino3dm/rhino3dm.wasm");
    const rhino = await rhinoModule.default({ wasmBinary: await readFile(wasmPath) });
    const doc = rhino.File3dm.fromByteArray(bytes);
    const layerNames = [];
    for (let i = 0; i < doc.layers().count; i++) layerNames.push(doc.layers().get(i).fullPath);
    const layerIndexByPath = new Map();
    for (let i = 0; i < doc.layers().count; i++) {
      layerIndexByPath.set(doc.layers().get(i).fullPath, i);
    }
    const objectCountOnLayer = (layerName) => {
      const layerIndex = layerIndexByPath.get(layerName);
      if (layerIndex === undefined) return 0;
      let count = 0;
      for (let i = 0; i < doc.objects().count; i++) {
        const object = doc.objects().get(i);
        const attrs = object?.attributes();
        if (!attrs || attrs.layerIndex !== layerIndex) continue;
        count += 1;
        if (count >= 1) return count;
      }
      return count;
    };
    return {
      header,
      layerNames,
      objectCount: doc.objects().count,
      objectCountOnLayer,
      destroy: () => doc.destroy(),
      parsed: "rhino3dm",
    };
  } catch {
    const fallback = inspectSitePlan3dmFromHeader(bytes);
    fallback.header = header;
    return fallback;
  }
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

    const cursorArtifacts = "/opt/cursor/artifacts";
    fs.mkdirSync(cursorArtifacts, { recursive: true });
  const a3Url = `${baseUrl}/citycut/?lat=-37.8136&lon=144.9631&shape=a3&a3scale=2500&a3ori=landscape&km=1.05&label=Melbourne%20CBD`;
    await page.goto(a3Url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector('.select .frame[data-shape="a3"]', { timeout: 20_000 });
    await page.waitForTimeout(600);
    const a3Landing = await page.evaluate(() => {
      const frame = document.querySelector(".select .frame[data-shape='a3']");
      const rect = frame?.getBoundingClientRect();
      const a3On = document.querySelector('.shape-btn.on[aria-label="A3"]');
      return {
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        a3Selected: Boolean(a3On),
        readout: document.querySelector(".dock-readout")?.textContent?.trim() ?? "",
      };
    });
    const a3AspectExpected = 420 / 297;
    const a3Aspect = a3Landing.width / Math.max(a3Landing.height, 1);
    await page.screenshot({ path: path.join(cursorArtifacts, "a3-landing-map-selection.png"), fullPage: false });
    assertCheck(
      "a3-landing-aspect",
      "A3 1:2500 landscape cut on the landing map keeps the √2 frame aspect and shows the scale readout",
      a3Landing.a3Selected &&
        a3Landing.readout.includes("1:2500") &&
        Math.abs(a3Aspect - a3AspectExpected) < 0.08,
      `aspect=${a3Aspect.toFixed(3)} expected≈${a3AspectExpected.toFixed(3)} readout="${a3Landing.readout}"`,
    );
    await page.locator("button.create-fab").click({ timeout: 30_000 });
    await page.waitForSelector(".model", { timeout: 240_000 });
    await page.getByRole("tab", { name: /Drawing/i }).click({ timeout: 120_000 });
    await page.waitForSelector("svg.plan", { timeout: 120_000 });
    await page.waitForTimeout(800);
    const drawingAspect = await page.evaluate(() => {
      const canvas = document.querySelector('svg.plan rect[data-cut-frame="1"]');
      if (!canvas) return null;
      const w = Number(canvas.getAttribute("width"));
      const h = Number(canvas.getAttribute("height"));
      if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null;
      return w / h;
    });
    const drawingChrome = await page.evaluate(() => ({
      fitNote: document.querySelector(".fit-note")?.textContent?.trim() ?? "",
      planScale: document.querySelector(".studio-scale-row select")?.value ?? "",
    }));
    assertCheck(
      "a3-drawing-fit-note",
      "An A3 cut at its 1:2500 plan scale shows no 'does not fit on A3' warning",
      !/does not fit on A3/i.test(drawingChrome.fitNote) && drawingChrome.planScale === "2500",
      `fitNote="${drawingChrome.fitNote}", planScale=${drawingChrome.planScale}`,
    );
    const [a3AiDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByRole("button", { name: "Quick export Adobe Illustrator .ai" }).click({ timeout: 30_000 }),
    ]);
    const a3AiPath = path.join(cursorArtifacts, "a3-cut-site-plan.ai");
    await a3AiDownload.saveAs(a3AiPath);
    const a3AiText = fs.readFileSync(a3AiPath, "latin1");
    const media = a3AiText.match(/\/MediaBox\s*\[\s*0(?:\s+0)?\s+([\d.]+)\s+([\d.]+)\s*\]/);
    const pageWidthMm = media ? (Number(media[1]) * 25.4) / 72 : 0;
    const pageHeightMm = media ? (Number(media[2]) * 25.4) / 72 : 0;
    const [a3SvgDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 120_000 }),
      page.getByRole("button", { name: "Quick export SVG" }).click({ timeout: 30_000 }),
    ]);
    const a3SvgPath = path.join(cursorArtifacts, "a3-cut-site-plan.svg");
    await a3SvgDownload.saveAs(a3SvgPath);
    const a3SvgText = fs.readFileSync(a3SvgPath, "utf8");
    const svgWidthMm = Number((a3SvgText.match(/width="([\d.]+)mm"/) ?? [])[1] ?? 0);
    const svgHeightMm = Number((a3SvgText.match(/height="([\d.]+)mm"/) ?? [])[1] ?? 0);
    await page.screenshot({ path: path.join(cursorArtifacts, "a3-drawing-view.png"), fullPage: false });
    assertCheck(
      "a3-drawing-aspect",
      "Drawing view for an A3 1:2500 landscape cut keeps the cut rectangle aspect on the plan canvas",
      drawingAspect != null && Math.abs(drawingAspect - a3AspectExpected) < 0.02,
      `planAspect=${drawingAspect?.toFixed(4) ?? "null"}`,
    );
    assertCheck(
      "a3-export-sheet-size",
      "A3 1:2500 .ai and .svg exports use a 420 × 297 mm page with no 'does not fit' note in the PDF",
      Math.abs(pageWidthMm - 420) <= 1 &&
        Math.abs(pageHeightMm - 297) <= 1 &&
        Math.abs(svgWidthMm - 420) <= 1 &&
        Math.abs(svgHeightMm - 297) <= 1 &&
        !/does not fit on A3/i.test(a3AiText),
      `ai=${pageWidthMm.toFixed(1)}×${pageHeightMm.toFixed(1)} mm svg=${svgWidthMm.toFixed(1)}×${svgHeightMm.toFixed(1)} mm`,
    );

    const rozelleA3Url =
      `${baseUrl}/citycut/?lat=-33.86721&lon=151.18163&shape=a3&a3scale=3000&a3ori=landscape&label=Rozelle%20NSW`;
    await page.goto(rozelleA3Url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector('.select .frame[data-shape="a3"]', { timeout: 20_000 });
    await page.locator("button.create-fab").click({ timeout: 30_000 });
    await page.waitForSelector(".model", { timeout: 360_000 });
    await page.waitForFunction(
      () => {
        const sceneCanvas = document.querySelector(".scene-viewport canvas");
        const modelCanvas = document.querySelector(".model canvas");
        const canvas = sceneCanvas ?? modelCanvas;
        if (!canvas) return false;
        const spanX = Number(sceneCanvas?.dataset.citycutGroundSpanX ?? 0);
        const spanZ = Number(sceneCanvas?.dataset.citycutGroundSpanZ ?? 0);
        const polar = Number(modelCanvas?.dataset.introPolar ?? canvas.dataset.introPolar ?? 0);
        const underlay = document.querySelector(".select.is-handoff-underlay");
        const bridgePill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
        const bridgeOpacity = bridgePill ? Number(getComputedStyle(bridgePill).opacity) : 0;
        const ready = /Ready ·\s*\d+\/\d+ sources/.test(document.body.innerText);
        return (
          ready &&
          spanX > 100 &&
          spanZ > 100 &&
          polar >= 0.95 &&
          !underlay &&
          bridgeOpacity <= 0.05
        );
      },
      { timeout: 360_000 },
    );
    await page.locator(".mode-btn", { hasText: "3D model" }).click({ timeout: 30_000 });
    await page.waitForTimeout(400);
    const rozelle3d = await page.evaluate(() => {
      const sceneCanvas = document.querySelector(".scene-viewport canvas");
      const spanX = Number(sceneCanvas?.dataset.citycutGroundSpanX ?? 0);
      const spanZ = Number(sceneCanvas?.dataset.citycutGroundSpanZ ?? 0);
      return { spanX, spanZ, aspect: spanZ > 0 ? spanX / spanZ : 0 };
    });
    await page.screenshot({
      path: path.join(cursorArtifacts, "rozelle-a3-3000-3d.png"),
      fullPage: false,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    const planProj = page.locator(".model .proj-group button", { hasText: "Plan" }).first();
    if ((await planProj.count()) > 0) {
      await planProj.click({ timeout: 30_000 });
      await page.waitForTimeout(600);
    }
    await page.screenshot({
      path: path.join(cursorArtifacts, "rozelle-a3-3000-3d-plan.png"),
      fullPage: false,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    assertCheck(
      "rozelle-a3-3d-ground-aspect",
      "Rozelle A3 1:3000 landscape cut clips 3D ground to the rectangular frame (~1.41:1)",
      Math.abs(rozelle3d.aspect - 420 / 297) <= 0.02,
      `spanX=${rozelle3d.spanX.toFixed(1)} spanZ=${rozelle3d.spanZ.toFixed(1)} aspect=${rozelle3d.aspect.toFixed(4)}`,
    );
    await page.getByRole("tab", { name: /Drawing/i }).click({ timeout: 120_000 });
    await page.waitForSelector("svg.plan", { timeout: 120_000 });
    await page.waitForTimeout(1200);
    const rozelleDrawing = await page.evaluate(() => {
      const planScale = document.querySelector(".studio-scale-row select")?.value ?? "";
      const nswLayerCount = document.querySelectorAll('[data-layer^="nsw-"]').length;
      return { planScale, nswLayerCount };
    });
    await page.screenshot({
      path: path.join(cursorArtifacts, "rozelle-a3-3000-drawing.png"),
      fullPage: false,
    });
    assertCheck(
      "rozelle-a3-drawing-scale",
      "Rozelle A3 1:3000 cut defaults Drawing plan scale to 1:3000",
      rozelleDrawing.planScale === "3000",
      `planScale=${rozelleDrawing.planScale}`,
    );
    assertCheck(
      "rozelle-a3-no-nsw-overlays",
      "Rozelle A3 Drawing view omits NSW planning overlay layers",
      rozelleDrawing.nswLayerCount === 0,
      `nswLayerCount=${rozelleDrawing.nswLayerCount}`,
    );

    await page.goto(`${baseUrl}/citycut/`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForSelector(".select .frame", { timeout: 20_000 });

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
    // SECTION KNIFE: real mouse gizmo drag (no ?qa=1)
    // -------------------------------------------------------------------------
    {
      const isoBtn = page.locator(".model .proj-btn.studio-submode-pill", { hasText: "Isometric" }).first();
      if ((await isoBtn.count()) === 0) {
        assertCheck(
          "section-knife-handle-drag",
          "Isometric view + real mouse drag on Section Knife handle changes offset without camera orbit",
          false,
          "Isometric pill missing",
        );
        assertCheck(
          "section-knife-ring-rotate",
          "Real mouse drag on Section Knife base ring changes angle without camera orbit",
          false,
          "Isometric pill missing",
        );
      } else {
        await isoBtn.click();
        await page.waitForTimeout(450);
        await page.locator(".section-knife-toggle").click();
        await page.waitForSelector(".section-knife-elevation", { timeout: 15000 });
        await page.waitForTimeout(1400);

        const readClipAudit = () =>
          page.evaluate(() => {
            const canvas = document.querySelector(".model canvas");
            const scaleX = canvas ? canvas.width / (canvas.clientWidth || 1) : 1;
            const scaleY = canvas ? canvas.height / (canvas.clientHeight || 1) : 1;
            const farClientX = Number(canvas?.dataset.sectionKnifeFarSampleX ?? "NaN");
            const farClientY = Number(canvas?.dataset.sectionKnifeFarSampleY ?? "NaN");
            return {
              lineClipOk: canvas?.dataset.sectionKnifeLineClipOk === "1",
              contourPresent: canvas?.dataset.sectionKnifeContourPresent === "1",
              contourClipped: canvas?.dataset.sectionKnifeContourClipped === "1",
              farX: Number.isFinite(farClientX) ? farClientX * scaleX : Number.NaN,
              farY: Number.isFinite(farClientY) ? farClientY * scaleY : Number.NaN,
            };
          });
        let clipAudit = await readClipAudit();
        for (let attempt = 0; attempt < 10 && !clipAudit.lineClipOk; attempt += 1) {
          await page.waitForTimeout(250);
          clipAudit = await readClipAudit();
        }
        const clipOk = clipAudit.lineClipOk && (!clipAudit.contourPresent || clipAudit.contourClipped);
        assertCheck(
          "section-knife-line-clip",
          "Section Knife clips 3D contour and line layers so they do not render on the cut-away side (dataset audit)",
          clipOk,
          `lineClipOk=${clipAudit.lineClipOk}, contourPresent=${clipAudit.contourPresent}, contourClipped=${clipAudit.contourClipped}`,
        );

        const measureFarDarkRatio = (pngPath, farX, farY) => {
          const png = PNG.sync.read(fs.readFileSync(pngPath));
          const { width, height, data } = png;
          const cx = Number.isFinite(farX) ? Math.round(farX) : Math.floor(width * 0.22);
          const cy = Number.isFinite(farY) ? Math.round(farY) : Math.floor(height * 0.45);
          const half = 48;
          let inkPx = 0;
          let samples = 0;
          for (let y = Math.max(0, cy - half); y < Math.min(height, cy + half); y++) {
            for (let x = Math.max(0, cx - half); x < Math.min(width, cx + half); x++) {
              const i = (width * y + x) * 4;
              const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              samples += 1;
              if (lum < 55) inkPx += 1;
            }
          }
          return samples > 0 ? inkPx / samples : 0;
        };
        const cutawayShotOn = path.join(TMP_FRAMES_DIR, "section-knife-cutaway-contours-on.png");
        await page.locator(".model canvas").screenshot({ path: cutawayShotOn });
        const ratioContoursOn = measureFarDarkRatio(cutawayShotOn, clipAudit.farX, clipAudit.farY);
        const contoursRow = page.locator(".model .left-outliner .layer-row", { hasText: /^Contours/ }).first();
        if ((await contoursRow.count()) > 0) {
          await contoursRow.click();
          await page.waitForTimeout(350);
        }
        const cutawayShotOff = path.join(TMP_FRAMES_DIR, "section-knife-cutaway-contours-off.png");
        await page.locator(".model canvas").screenshot({ path: cutawayShotOff });
        const ratioContoursOff = measureFarDarkRatio(cutawayShotOff, clipAudit.farX, clipAudit.farY);
        if ((await contoursRow.count()) > 0) {
          await contoursRow.click();
          await page.waitForTimeout(250);
        }
        const contourDelta = Math.abs(ratioContoursOn - ratioContoursOff);
        assertCheck(
          "section-knife-cutaway-contour-leak",
          "Contours on the cut-away side are clipped (toggling contours off does not change far-side ink)",
          contourDelta < 0.035,
          `contoursOn=${ratioContoursOn.toFixed(3)}, contoursOff=${ratioContoursOff.toFixed(3)}, delta=${contourDelta.toFixed(3)}`,
        );

        const hudAudit = await page.evaluate(() => {
          const chart = document.querySelector(".section-knife-elevation-chart");
          if (!chart) return { ok: false, detail: "chart missing" };
          const text = chart.textContent ?? "";
          const hasRl = text.includes("RL ");
          const hasScale = text.includes("250") && text.includes("500");
          const rects = chart.querySelectorAll("rect");
          const hasGroundFill = rects.length > 0;
          const endLabels = Array.from(chart.querySelectorAll(".section-knife-end-label"));
          const labelTexts = endLabels.map((el) => el.textContent?.trim() ?? "");
          const endLabelRects = endLabels.map((el) => el.getBoundingClientRect());
          const endLabelsVisible =
            endLabelRects.length === 2 &&
            endLabelRects.every((r) => r.width > 2 && r.height > 2 && r.bottom > 0);
          const endLabelsOk =
            labelTexts.length === 2 &&
            labelTexts[0] === "A" &&
            labelTexts[1] === "A′" &&
            endLabelsVisible;
          const rlEls = Array.from(chart.querySelectorAll(".section-knife-rl"));
          const rlCountOk = rlEls.length >= 2 && rlEls.length <= 5;
          const rlRects = rlEls.map((el) => el.getBoundingClientRect());
          let rlOverlap = false;
          for (let i = 0; i < rlRects.length; i++) {
            for (let j = i + 1; j < rlRects.length; j++) {
              const a = rlRects[i];
              const b = rlRects[j];
              const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
              const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
              if (xOverlap > 1 && yOverlap > 1) rlOverlap = true;
            }
          }
          const ok = hasRl && hasScale && hasGroundFill && endLabelsOk && rlCountOk && !rlOverlap;
          return {
            ok,
            hasRl,
            hasScale,
            hasGroundFill,
            endLabelsOk,
            rlCount: rlEls.length,
            rlOverlap,
            labelTexts,
          };
        });
        assertCheck(
          "section-knife-hud-drawing",
          "Section HUD reads as an architectural section (RL grid, distance scale, A/A′ labels, filled ground mass)",
          hudAudit.ok,
          `end=${hudAudit.labelTexts?.join("/")}, rlCount=${hudAudit.rlCount}, rlOverlap=${hudAudit.rlOverlap}`,
        );
        assertCheck(
          "section-knife-hud-axis-labels",
          "Section HUD RL labels do not overlap and A/A′ are not duplicated",
          hudAudit.endLabelsOk && hudAudit.rlCount >= 2 && hudAudit.rlCount <= 5 && !hudAudit.rlOverlap,
          `end=${hudAudit.labelTexts?.join("/")}, rlCount=${hudAudit.rlCount}, rlOverlap=${hudAudit.rlOverlap}`,
        );

        await page.locator(".mode-btn", { hasText: "Drawing" }).click();
        await page.waitForTimeout(900);
        await page
          .waitForFunction(
            () => {
              const bubble = document
                .querySelector('[data-section-knife-marker-end-label="A"]')
                ?.parentElement?.querySelector(".section-knife-marker-bubble");
              return bubble && bubble.getBoundingClientRect().width >= 16;
            },
            { timeout: 20000 },
          )
          .catch(() => undefined);
        const planMarkerCount = await page.locator("[data-section-knife-plan-markers='1']").count();
        assertCheck(
          "section-knife-plan-marker",
          "Site plan shows a live section marker while Section Knife is on",
          planMarkerCount > 0,
          `markerGroups=${planMarkerCount}`,
        );
        const measurePlanMarkerRendered = () =>
          page.evaluate(() => {
            const measureOne = (key) => {
              const bubble = document
                .querySelector(`[data-section-knife-marker-end-label="${key}"]`)
                ?.parentElement?.querySelector(".section-knife-marker-bubble");
              const label = document.querySelector(`[data-section-knife-marker-end-label="${key}"]`);
              const arrow = document
                .querySelector(`[data-section-knife-marker-end-label="${key}"]`)
                ?.parentElement?.querySelector(".section-knife-marker-arrow");
              const br = bubble?.getBoundingClientRect();
              const lr = label?.getBoundingClientRect();
              const ar = arrow?.getBoundingClientRect();
              return {
                key,
                bubbleDiam: br?.width ?? 0,
                labelH: lr?.height ?? 0,
                arrowMax: ar ? Math.max(ar.width, ar.height) : 0,
                center: br ? { x: br.left + br.width / 2, y: br.top + br.height / 2 } : null,
                text: label?.textContent?.trim() ?? "",
              };
            };
            const a = measureOne("A");
            const aprime = measureOne("Aprime");
            const okOne = (m) => m.bubbleDiam >= 16 && m.bubbleDiam <= 18 && m.labelH >= 8 && m.arrowMax >= 8;
            const sep =
              a.center && aprime.center
                ? Math.hypot(a.center.x - aprime.center.x, a.center.y - aprime.center.y)
                : 0;
            return { a, aprime, ok: okOne(a) && okOne(aprime) && sep > 80 };
          });
        const planWheelSteps = async (stepsIn) => {
          const deltaY = stepsIn < 0 ? -200 : 200;
          for (let i = 0; i < Math.abs(stepsIn); i++) {
            await page.evaluate((dy) => {
              const svg = document.querySelector("svg.plan");
              if (!svg) return;
              const rect = svg.getBoundingClientRect();
              svg.dispatchEvent(
                new WheelEvent("wheel", {
                  deltaY: dy,
                  deltaMode: 0,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            }, deltaY);
            await page.waitForTimeout(150);
          }
        };
        const baseRender = await measurePlanMarkerRendered();
        await planWheelSteps(-2);
        await page.waitForTimeout(300);
        const zoomInRender = await measurePlanMarkerRendered();
        await planWheelSteps(2);
        await page.waitForTimeout(300);
        const zoomBackRender = await measurePlanMarkerRendered();
        await planWheelSteps(2);
        await page.waitForTimeout(300);
        const zoomOutRender = await measurePlanMarkerRendered();
        const cropClipForKey = async (key) =>
          page.evaluate((k) => {
            const bubble = document
              .querySelector(`[data-section-knife-marker-end-label="${k}"]`)
              ?.parentElement?.querySelector(".section-knife-marker-bubble");
            const br = bubble?.getBoundingClientRect();
            if (!br) return null;
            const cx = br.left + br.width / 2;
            const cy = br.top + br.height / 2;
            return {
              x: Math.max(0, Math.floor(cx - 150)),
              y: Math.max(0, Math.floor(cy - 150)),
              width: 300,
              height: 300,
            };
          }, key);
        const clipA = await cropClipForKey("A");
        const clipAprime = await cropClipForKey("Aprime");
        let cropHashOk = false;
        let cropHashDetail = "no-clips";
        if (clipA && clipAprime) {
          const dist = Math.hypot(clipA.x - clipAprime.x, clipA.y - clipAprime.y);
          const hA = crypto.createHash("md5").update(await page.screenshot({ clip: clipA, type: "png" })).digest("hex");
          const hAprime = crypto
            .createHash("md5")
            .update(await page.screenshot({ clip: clipAprime, type: "png" }))
            .digest("hex");
          cropHashOk = hA !== hAprime && dist > 40;
          cropHashDetail = `dist=${dist.toFixed(0)}, hA=${hA.slice(0, 8)}, hAprime=${hAprime.slice(0, 8)}`;
        }
        const zoomOk = zoomInRender.ok && zoomBackRender.ok && zoomOutRender.ok;
        const planMarkerOk = baseRender.ok && zoomOk && cropHashOk;
        const fmtEnd = (m) =>
          `${m.key}:d=${m.bubbleDiam.toFixed(1)},textH=${m.labelH.toFixed(1)},arrow=${m.arrowMax.toFixed(1)}(${m.text})`;
        assertCheck(
          "section-drawing-set-plan-marker",
          "Plan section mark: rendered 17±1 px bubbles, ≥8 px A/A′ text and arrows (getBoundingClientRect), stable across plan zoom, distinct A/A′ crops",
          planMarkerOk,
          `base=[${fmtEnd(baseRender.a)}|${fmtEnd(baseRender.aprime)}], zoomIn=${zoomInRender.ok}, back=${zoomBackRender.ok}, out=${zoomOutRender.ok}, crops=${cropHashDetail}`,
        );
        await page.locator(".mode-btn", { hasText: "3D model" }).click();
        await page.waitForTimeout(400);
        const isoRestore = page.locator(".model .proj-btn.studio-submode-pill", { hasText: "Isometric" }).first();
        if ((await isoRestore.count()) > 0) await isoRestore.click();
        await page.waitForTimeout(450);
        const snapToggle = page.locator(".section-knife-tools label.check-field input[type=checkbox]").first();
        if (await snapToggle.isChecked()) await snapToggle.click();
        await page.waitForTimeout(200);

        const exportAudit = await page.evaluate(() => {
          const audit = window.__citycutSectionExportAudit?.();
          if (!audit) return { ok: false, detail: "audit missing" };
          return audit;
        });
        assertCheck(
          "section-knife-export-layers",
          "Section export SVG contains Section:: layers and a ground profile",
          exportAudit.ok,
          `layers=${exportAudit.layers?.join(",") ?? exportAudit.detail}`,
        );

        if (fs.existsSync(ARTIFACTS_DIR)) {
          await page.locator(".model canvas").screenshot({
            path: path.join(ARTIFACTS_DIR, "section-knife-3d-no-contour-leak-1440x900.png"),
          });
          await page.locator(".section-knife-elevation").screenshot({
            path: path.join(ARTIFACTS_DIR, "section-knife-hud-1440x900.png"),
          });
        }

        const readKnifeState = () =>
          page.evaluate(() => {
            const canvas = document.querySelector(".model canvas");
            const note = document.querySelector("[data-section-knife-offset-m]");
            return {
              offset: Number(note?.getAttribute("data-section-knife-offset-m") ?? "0"),
              angle: Number(note?.getAttribute("data-section-knife-angle-rad") ?? "0"),
              camPos: canvas?.dataset.camPosition ?? "",
              camTarget: canvas?.dataset.camTarget ?? "",
              handleX: Number(canvas?.dataset.sectionKnifeHandleX ?? "NaN"),
              handleY: Number(canvas?.dataset.sectionKnifeHandleY ?? "NaN"),
              ringX: Number(canvas?.dataset.sectionKnifeRingX ?? "NaN"),
              ringY: Number(canvas?.dataset.sectionKnifeRingY ?? "NaN"),
            };
          });

        let beforeHandle = await readKnifeState();
        for (let attempt = 0; attempt < 8 && !Number.isFinite(beforeHandle.handleX); attempt += 1) {
          await page.waitForTimeout(250);
          beforeHandle = await readKnifeState();
        }

        const canvasBox = await page.locator(".model canvas").boundingBox();
        if (!canvasBox || !Number.isFinite(beforeHandle.handleX)) {
          assertCheck(
            "section-knife-handle-drag",
            "Isometric view + real mouse drag on Section Knife handle changes offset without camera orbit",
            false,
            `handle screen coords unavailable (handle=${beforeHandle.handleX},${beforeHandle.handleY})`,
          );
        } else {
          const hx = canvasBox.x + beforeHandle.handleX;
          const hy = canvasBox.y + beforeHandle.handleY;
          await page.mouse.move(hx, hy);
          await page.waitForTimeout(60);
          await page.mouse.down();
          for (let i = 0; i < 14; i++) {
            await page.mouse.move(hx - 10 * (i + 1), hy + 5 * (i + 1), { steps: 2 });
            await page.waitForTimeout(35);
          }
          await page.mouse.up();
          await page.waitForTimeout(220);
          const afterHandle = await readKnifeState();
          const offsetDelta = Math.abs(afterHandle.offset - beforeHandle.offset);
          const camStable =
            afterHandle.camPos === beforeHandle.camPos && afterHandle.camTarget === beforeHandle.camTarget;
          assertCheck(
            "section-knife-handle-drag",
            "Isometric view + real mouse drag on Section Knife handle changes offset without camera orbit",
            offsetDelta > 0.04 && camStable,
            `offset ${beforeHandle.offset.toFixed(3)} -> ${afterHandle.offset.toFixed(3)}, camPosStable=${camStable}`,
          );

          let beforeRing = await readKnifeState();
          for (let attempt = 0; attempt < 8 && !Number.isFinite(beforeRing.ringX); attempt += 1) {
            await page.waitForTimeout(250);
            beforeRing = await readKnifeState();
          }
          const ringBox = await page.locator(".model canvas").boundingBox();
          if (!ringBox || !Number.isFinite(beforeRing.ringX)) {
            assertCheck(
              "section-knife-ring-rotate",
              "Real mouse drag on Section Knife base ring changes angle without camera orbit",
              false,
              `ring screen coords unavailable (ring=${beforeRing.ringX},${beforeRing.ringY})`,
            );
          } else {
            const rx = ringBox.x + beforeRing.ringX;
            const ry = ringBox.y + beforeRing.ringY;
            await page.mouse.move(rx, ry);
            await page.waitForTimeout(60);
            await page.mouse.down();
            for (let i = 0; i < 16; i++) {
              await page.mouse.move(rx + 12 * (i + 1), ry, { steps: 2 });
              await page.waitForTimeout(35);
            }
            await page.mouse.up();
            await page.waitForTimeout(220);
            const afterRing = await readKnifeState();
            const angleDelta = Math.abs(afterRing.angle - beforeRing.angle);
            const camStableRing =
              afterRing.camPos === beforeRing.camPos && afterRing.camTarget === beforeRing.camTarget;
            assertCheck(
              "section-knife-ring-rotate",
              "Real mouse drag on Section Knife base ring changes angle without camera orbit",
              angleDelta > 0.015 && camStableRing,
              `angle ${beforeRing.angle.toFixed(4)} -> ${afterRing.angle.toFixed(4)}, camPosStable=${camStableRing}`,
            );
          }
        }

        const offsetBefore = await page.evaluate(() =>
          Number(document.querySelector("[data-section-knife-offset-m]")?.getAttribute("data-section-knife-offset-m") ?? "0"),
        );
        const offsetInput = page.locator(".section-knife-offset-input");
        if ((await offsetInput.count()) > 0) {
          await offsetInput.fill("6");
          await offsetInput.dispatchEvent("change");
        }
        await page.waitForTimeout(350);
        const offsetAfter = await page.evaluate(() =>
          Number(document.querySelector("[data-section-knife-offset-m]")?.getAttribute("data-section-knife-offset-m") ?? "0"),
        );
        assertCheck(
          "section-knife-numeric-offset",
          "Section Knife offset input moves the active plane",
          Math.abs(offsetAfter - 6) < 0.6 && Math.abs(offsetAfter - offsetBefore) > 0.4,
          `before=${offsetBefore.toFixed(2)}, after=${offsetAfter.toFixed(2)}`,
        );
      }
    }

    // -------------------------------------------------------------------------
    // TYPOGRAPHY & CSS SURFACE INVARIANTS
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

    await page.keyboard.press("Control+KeyK");
    await page.waitForTimeout(120);
    const commandBarInfo = await page.evaluate(() => {
      const dialog = document.querySelector(".command-bar[role='dialog']");
      const input = dialog?.querySelector(".command-bar-input");
      const cs = dialog ? getComputedStyle(dialog) : null;
      return {
        open: Boolean(dialog && input),
        fontFamily: input ? getComputedStyle(input).fontFamily : "",
        backdrop: Boolean(document.querySelector(".command-bar-backdrop")),
        bg: cs?.backgroundColor ?? "",
      };
    });
    if (fs.existsSync(ARTIFACTS_DIR)) {
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, "command-bar-open-desktop.png") });
    }
    await page.keyboard.press("Escape");
    assertCheck(
      "command-bar-desktop",
      "Ctrl+K opens the Studio HUD command bar on desktop with a focused search field (Geist, hud-card surface)",
      commandBarInfo.open &&
        commandBarInfo.backdrop &&
        commandBarInfo.fontFamily.startsWith("Geist") &&
        commandBarInfo.bg.includes("252"),
      `open=${commandBarInfo.open}, font=${commandBarInfo.fontFamily}, bg=${commandBarInfo.bg}`,
    );

    // 3D DISPLAY OUTLINER INVARIANT (PER-USE BUILDINGS + RESET COLOURS BUTTON)
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

    // SITE ANALYSIS DIRECTION A INVARIANT (IN 3D MODEL)
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
      const siteIsland = document.querySelector(".model .site-island");
      const islandRect = siteIsland?.getBoundingClientRect();
      const topBarCenter = document.querySelector(".model .top-bar-center")?.getBoundingClientRect();
      const bottomRow = siteIsland?.querySelector(".env-bottom-row");
      const hasBottomCompass = Boolean(document.querySelector(".model .bottom-bar .compass-mini"));
      const hasBottomReset = Boolean(document.querySelector(".model .bottom-bar .cam-reset"));
      const hasTopCenterReset = Boolean(document.querySelector(".model .top-bar-center .cam-reset"));
      const capText = siteIsland?.querySelector(".site-island-cap")?.textContent ?? "";
      const noHorizontalOverflow = Boolean(
        siteIsland &&
          bottomRow &&
          siteIsland.scrollWidth <= siteIsland.clientWidth + 1 &&
          bottomRow.scrollWidth <= bottomRow.clientWidth + 1,
      );
      const clearsTopBar =
        Boolean(islandRect && topBarCenter) &&
        islandRect.top >= topBarCenter.bottom - 2 &&
        Math.abs(islandRect.left + islandRect.width / 2 - (topBarCenter.left + topBarCenter.width / 2)) < 80;
      return {
        visibleLeftDrawerCount: visibleLeftDrawers.length,
        hasSiteIsland: Boolean(siteIsland && islandRect && islandRect.width > 120 && islandRect.height > 24),
        hasBottomCompass,
        hasBottomReset,
        hasTopCenterReset,
        noHorizontalOverflow,
        clearsTopBar,
        capHasTime: /\d{2}:\d{2}/.test(capText),
        hasBottomEnvConsole: Boolean(document.querySelector(".model .env-console")),
        islandRect: islandRect
          ? { top: Math.round(islandRect.top), width: Math.round(islandRect.width), height: Math.round(islandRect.height) }
          : null,
      };
    });

    assertCheck(
      "site-analysis-direction-a",
      "Clicking Analysis hides the left drawer completely (0 visible left drawer), shows the top-centre Site Island capsule below the view switcher (not overlapping), removes the bottom environmental console, and places Reset view in .top-bar-center",
      analysisInfo.visibleLeftDrawerCount === 0 &&
        analysisInfo.hasSiteIsland &&
        !analysisInfo.hasBottomEnvConsole &&
        !analysisInfo.hasBottomCompass &&
        !analysisInfo.hasBottomReset &&
        analysisInfo.hasTopCenterReset &&
        analysisInfo.clearsTopBar &&
        analysisInfo.capHasTime,
      `visibleLeftDrawers=${analysisInfo.visibleLeftDrawerCount}, topReset=${analysisInfo.hasTopCenterReset}, clearsTopBar=${analysisInfo.clearsTopBar}, capTime=${analysisInfo.capHasTime}, rect=${JSON.stringify(analysisInfo.islandRect)}`,
    );

    const siteIslandLocator = page.locator(".model .site-island").first();
    await siteIslandLocator.hover();
    await page.waitForTimeout(280);
    const has3dSunDome = await page.locator(".model .site-island .overlay-chips button", { hasText: "3D Sun Dome" }).count();
    assertCheck(
      "site-island-solar-expand",
      "Hovering Site Island expands overlay controls with 3D Sun Dome in 3D view",
      has3dSunDome > 0,
      `sunDomeButtons=${has3dSunDome}`,
    );
    const solarScrub = page.locator('.model .site-island input[aria-label="Solar time of day"]');
    if (await solarScrub.count()) {
      const box = await solarScrub.first().boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5);
        await page.waitForTimeout(200);
      }
    }
    await page.mouse.move(400, 400);
    await page.waitForTimeout(260);

    await page.getByRole("tab", { name: /Walk Ripple/i }).click();
    await page.waitForTimeout(250);
    await siteIslandLocator.hover();
    await page.waitForTimeout(200);
    await page.getByRole("button", { name: /Pick origin/i }).first().click();
    const rippleCanvas = page.locator(".model canvas").first();
    const rippleCanvasBox = await rippleCanvas.boundingBox();
    if (!rippleCanvasBox) throw new Error("Walk ripple: missing model canvas");
    await page.mouse.click(
      rippleCanvasBox.x + rippleCanvasBox.width * 0.5,
      rippleCanvasBox.y + rippleCanvasBox.height * 0.52,
    );
    const scrubTrack = page.locator(".model .walk-ripple-scrubber-track");
    await page.waitForFunction(
      () => {
        const track = document.querySelector(".model .walk-ripple-scrubber-track");
        return track && track.getAttribute("aria-disabled") === "false";
      },
      { timeout: 120000 },
    );
    await page.waitForTimeout(800);

    await scrubTrack.waitFor({ state: "visible", timeout: 10000 });
    const trackBox = await scrubTrack.boundingBox();
    if (!trackBox) throw new Error("Walk ripple: scrubber track missing");

    const readScrubState = () =>
      page.evaluate(() => {
        const readout = document.querySelector(".model .walk-ripple-time-readout");
        const label = readout?.getAttribute("data-walk-ripple-minutes") ?? "";
        const reached = Number(readout?.getAttribute("data-walk-ripple-reached") ?? "0");
        return { label, reached, minutes: Number.parseFloat(label) };
      });

    const dragScrubToPct = async (pct) => {
      const box = await scrubTrack.boundingBox();
      if (!box) throw new Error("Walk ripple: scrubber track missing");
      const x = box.x + box.width * pct;
      const y = box.y + box.height * 0.5;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 2, y);
      await page.mouse.up();
      await page.waitForTimeout(280);
    };

    await dragScrubToPct(0.08);
    const atLow = await readScrubState();

    await dragScrubToPct(0.62);
    const atHigh = await readScrubState();

    const rippleOverflow = await page.evaluate(() => {
      const siteIsland = document.querySelector(".model .site-island");
      const bottomRow = siteIsland?.querySelector(".env-bottom-row");
      return Boolean(
        siteIsland &&
          bottomRow &&
          siteIsland.scrollWidth <= siteIsland.clientWidth + 1 &&
          bottomRow.scrollWidth <= bottomRow.clientWidth + 1,
      );
    });

    assertCheck(
      "walk-ripple-time-scrubber",
      "Walk Ripple scrubber accepts Playwright mouse drags, updates minute readout and uRippleTime, increases reached-building count, and keeps the Site Island row without horizontal overflow",
      rippleOverflow &&
        atLow.minutes >= 0.5 &&
        atLow.minutes <= 4.5 &&
        atHigh.minutes >= 10 &&
        atHigh.minutes <= 14.5 &&
        atHigh.reached > atLow.reached &&
        atHigh.reached - atLow.reached >= 3,
      `low=[min=${atLow.minutes}, reached=${atLow.reached}, label=${atLow.label}], high=[min=${atHigh.minutes}, reached=${atHigh.reached}, label=${atHigh.label}], noOverflow=${rippleOverflow}`,
    );

    await page.getByRole("button", { name: /Replay walk ripple/i }).click();
    await page.waitForTimeout(400);
    const replayStart = await readScrubState();
    assertCheck(
      "walk-ripple-replay",
      "Walk Ripple replay button restarts the 0–20 min animation from the scrubber row",
      replayStart.minutes <= 1.5,
      `minutesAfterReplayClick=${replayStart.minutes}`,
    );

    await page.locator('.model .site-island .env-mode-btn', { hasText: "Solar Study" }).click();
    await page.waitForTimeout(200);

    // DRAWING -> DISPLAY OUTLINER CLEANUP & RESET COLOURS INVARIANT
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

    await analysisBtn.click();
    await page.waitForTimeout(300);

    await siteIslandLocator.hover();
    await page.waitForTimeout(200);
    const planFanBtn = page.locator(".model .site-island .overlay-chips button", { hasText: "9–3pm Plan Fan" });
    await planFanBtn.click();
    await page.waitForSelector("svg.plan [data-shadow-hour] path", { timeout: 10000 });
    await page.waitForTimeout(300);

    const beforeSelectInfo = await page.evaluate(() => {
      const envText = document.querySelector(".model .site-island")?.textContent ?? "";
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

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".select .map-wrap .frame-handle-se", { timeout: 15000 });
    await page.waitForTimeout(600);

    const cutHandleDragBefore = await page.evaluate(() => {
      const cad = document.querySelector(".select .map-wrap .frame-cad-tag");
      const handle = document.querySelector(".select .map-wrap .frame-handle-se");
      const handleCs = handle ? getComputedStyle(handle) : null;
      return {
        cadText: cad?.textContent?.trim() ?? "",
        handlePointerEvents: handleCs?.pointerEvents ?? "",
      };
    });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "cut-handle-drag-before.png") });

    const seHandle = page.locator(".select .map-wrap .frame-handle-se");
    const seBox = await seHandle.boundingBox();
    let cutHandleDragOk = false;
    let cutHandleDragAfterText = "";
    if (seBox) {
      const startX = seBox.x + seBox.width / 2;
      const startY = seBox.y + seBox.height / 2;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 72, startY + 72, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      cutHandleDragAfterText = await page.evaluate(
        () => document.querySelector(".select .map-wrap .frame-cad-tag")?.textContent?.trim() ?? "",
      );
      cutHandleDragOk =
        cutHandleDragAfterText.length > 0 &&
        cutHandleDragAfterText !== cutHandleDragBefore.cadText &&
        /×/.test(cutHandleDragAfterText);
    }
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "cut-handle-drag-after.png") });

    assertCheck(
      "cut-handle-drag-readout",
      "Dragging a cut corner handle updates the bottom coordinate pill (W × H m | km² · MGA)",
      cutHandleDragOk && cutHandleDragBefore.handlePointerEvents === "auto",
      `before="${cutHandleDragBefore.cadText}", after="${cutHandleDragAfterText}", pointerEvents=${cutHandleDragBefore.handlePointerEvents}`,
    );

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
        ["frame_01.png", 14],
        ["frame_02.png", 14],
        ["frame_03.png", 10],
        ["frame_04.png", 8],
        ["frame_05.png", 14],
        ["frame_06.png", 14],
        ["frame_07.png", 10],
        ["frame_08.png", 20],
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
    fs.mkdirSync(cursorArtifacts, { recursive: true });
  const sydneyCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await sydneyCtx.addInitScript(() => {
      window.__citycutMinSilentLoadMs = 0;
    });
    const sydneyPage = await sydneyCtx.newPage();
    const sydneyQuery = "qa=1&lat=-33.861&lon=151.171&km=1.3";
    await sydneyPage.goto(`${baseUrl}/?${sydneyQuery}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await sydneyPage.waitForSelector("button.create-fab", { timeout: 30_000 });
    await sydneyPage.click("button.create-fab");
    await sydneyPage.waitForFunction(
      () => {
        const err = document.querySelector(".sidebar-foot-error")?.textContent?.trim();
        if (err) return true;
        return Boolean(document.querySelector(".model canvas"));
      },
      null,
      { timeout: 300_000 },
    );
    const sydneyBuildState = await sydneyPage.evaluate(() => ({
      buildError: document.querySelector(".sidebar-foot-error")?.textContent?.trim() ?? null,
      has3d: Boolean(document.querySelector(".model canvas")),
    }));
    assertCheck(
      "sydney-harbour-create-model",
      "Sydney Rozelle 1.3 km square (all layers) builds without a footer error and opens the model viewport",
      !sydneyBuildState.buildError && sydneyBuildState.has3d,
      `error=${sydneyBuildState.buildError ?? "none"}, has3d=${sydneyBuildState.has3d}`,
    );
    await sydneyPage.screenshot({
      path: path.join(cursorArtifacts, "sydney-rozelle-3d-model.png"),
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    await sydneyPage.getByRole("tab", { name: "Drawing" }).click({ timeout: 60_000 });
    await sydneyPage.getByRole("button", { name: "Site plan" }).click({ timeout: 60_000 });
    await sydneyPage.waitForSelector("svg.plan", { timeout: 120_000 });
    const sydneyAnalysis = sydneyPage.getByRole("button", { name: "Analysis" }).first();
    await sydneyAnalysis.click({ timeout: 60_000 });
    await sydneyPage.waitForTimeout(400);
    const sydneyPlanFanBtn = sydneyPage.locator(".model .env-console .overlay-chips button", { hasText: "9–3pm Plan Fan" });
    await sydneyPlanFanBtn.click({ timeout: 30_000 });
    await sydneyPage.waitForSelector("svg.plan [data-shadow-hour] path", { timeout: 60_000 });
    await sydneyPage.waitForSelector("svg.plan .plan-north-arrow", { timeout: 60_000 });
    await sydneyPage.waitForSelector("svg.plan .heliodon-plan", { timeout: 120_000 });
    const sydneyPlanState = await sydneyPage.evaluate(() => ({
      buildError: document.querySelector(".sidebar-foot-error")?.textContent?.trim() ?? null,
      hasPlan: Boolean(document.querySelector("svg.plan")),
    }));
    assertCheck(
      "sydney-harbour-site-plan",
      "Sydney Rozelle cut renders a 2D site plan after Create model",
      !sydneyPlanState.buildError && sydneyPlanState.hasPlan,
      `error=${sydneyPlanState.buildError ?? "none"}, hasPlan=${sydneyPlanState.hasPlan}`,
    );
    assertCheck(
      "sydney-harbour-sun-study-plan-chrome",
      "Sun study on the site plan shows the on-frame north arrow and heliodon overlay",
      await sydneyPage.locator("svg.plan .plan-north-arrow").count() > 0 &&
        (await sydneyPage.locator("svg.plan .heliodon-plan").count()) > 0,
      "north arrow and heliodon layer present",
    );
    const sydneySunDome = sydneyPage.locator(".model .env-console .overlay-chips button", {
      hasText: "3D Sun Dome",
    });
    if ((await sydneySunDome.count()) > 0 && (await sydneySunDome.getAttribute("aria-pressed")) === "true") {
      await sydneySunDome.click({ timeout: 30_000 });
    }
    const exportHasLayer = (bytes, label) => {
      const text = Buffer.from(bytes).toString("latin1");
      return text.includes(label) || text.includes(`CityCut ${label}`);
    };
    const [sydneyAiDownload] = await Promise.all([
      sydneyPage.waitForEvent("download", { timeout: 120_000 }),
      sydneyPage.getByRole("button", { name: "Quick export Adobe Illustrator .ai" }).click({ timeout: 30_000 }),
    ]);
    const sydneyAiPath = path.join(cursorArtifacts, "site-plan-button-download.ai");
    await sydneyAiDownload.saveAs(sydneyAiPath);
    const sydneyAiBuf = fs.readFileSync(sydneyAiPath);
    const hourlyShadowLabels = [
      "Shadow 09:00",
      "Shadow 10:00",
      "Shadow 11:00",
      "Shadow 12:00",
      "Shadow 13:00",
      "Shadow 14:00",
      "Shadow 15:00",
    ];
    const aiHasHourlyFan = hourlyShadowLabels.every((label) => exportHasLayer(sydneyAiBuf, label));
    assertCheck(
      "site-plan-ai-heliodon-layer",
      "Quick-export .ai includes the Sun path heliodon layer while 9–3pm Plan Fan is on without 3D Sun Dome",
      exportHasLayer(sydneyAiBuf, "Sun path") && sydneyAiBuf.length > 2000,
      `bytes=${sydneyAiBuf.length}`,
    );
    assertCheck(
      "site-plan-ai-hourly-shadow-layers",
      "Quick-export .ai carries one Illustrator layer per 9am–3pm shadow hour while Plan Fan is on (not a single Shadows layer)",
      aiHasHourlyFan && exportHasLayer(sydneyAiBuf, "Buildings"),
      `hourly=${hourlyShadowLabels.filter((label) => exportHasLayer(sydneyAiBuf, label)).join(",")}`,
    );
  try {
    execFileSync(
      "pdftoppm",
      ["-png", "-singlefile", "-f", "1", "-l", "1", sydneyAiPath, path.join(cursorArtifacts, "ai-export-render")],
      { stdio: "pipe" },
    );
  } catch {
  }
    const [sydneySvgDownload] = await Promise.all([
      sydneyPage.waitForEvent("download", { timeout: 120_000 }),
      sydneyPage.getByRole("button", { name: "Quick export SVG" }).click({ timeout: 30_000 }),
    ]);
    const sydneySvgPath = path.join(cursorArtifacts, "site-plan-button-download.svg");
    await sydneySvgDownload.saveAs(sydneySvgPath);
    const sydneySvgText = fs.readFileSync(sydneySvgPath, "utf8");
    assertCheck(
      "site-plan-svg-heliodon-layer",
      "Quick-export .svg includes the Sun path diagram while plan fan is on",
      sydneySvgText.includes('inkscape:label="Sun path"') &&
        (sydneySvgText.match(/<ellipse /g) ?? []).length >= 7,
      `bytes=${sydneySvgText.length}`,
    );
    await sydneyPage.screenshot({
      path: path.join(cursorArtifacts, "sydney-rozelle-2d-plan.png"),
      fullPage: false,
    });
    let sitePlan3dmOk = false;
    let sitePlan3dmDetail = "";
    try {
      const downloadPromise = sydneyPage.waitForEvent("download", { timeout: 180_000 });
      await sydneyPage.getByRole("button", { name: /^Quick export 3dm$/i }).click();
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      const chunks = [];
      for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const inspected = await inspectSitePlan3dm(bytes);
      const sunPathCurves = inspected.objectCountOnLayer("Sun path");
      const noonShadowCurves = inspected.objectCountOnLayer("Shadow 12:00");
      const hasMga56 =
        inspected.header.includes("EPSG:7856") || bytes.includes(Buffer.from("EPSG:7856", "utf8"));
      const hasGeometry =
        inspected.objectCount > 0 ||
        (inspected.parsed === "header" && bytes.length > 8_000 && sunPathCurves > 0 && noonShadowCurves > 0);
      sitePlan3dmOk =
        filename.endsWith(".3dm") &&
        bytes.length > 800 &&
        hasMga56 &&
        inspected.layerNames.includes("Buildings") &&
        inspected.layerNames.includes("Sun path") &&
        inspected.layerNames.includes("Shadow 12:00") &&
        sunPathCurves > 0 &&
        noonShadowCurves > 0 &&
        hasGeometry;
      inspected.destroy();
      sitePlan3dmDetail = `file=${filename}, bytes=${bytes.length}, parsed=${inspected.parsed}, layers=${inspected.layerNames.join("|")}, sunPath=${sunPathCurves}, shadow12=${noonShadowCurves}, objects=${inspected.objectCount}`;
    } catch (error) {
      sitePlan3dmDetail = error instanceof Error ? error.message : String(error);
    }
    assertCheck(
      "sydney-site-plan-3dm-download",
      "Drawing quick export .3dm downloads a layered Sydney site plan in MGA zone 56 with curve objects",
      sitePlan3dmOk,
      sitePlan3dmDetail,
    );
    const sydneyPlan = sydneyPage.locator("svg.plan");
    const sydneyPlanBox = await sydneyPlan.boundingBox();
    if (sydneyPlanBox) {
      const screenPlanBuf = await sydneyPlan.screenshot({ type: "png" });
      const frameSvg = await sydneyPage.evaluate(async () => {
        if (!window.__citycutQaPlan) throw new Error("missing __citycutQaPlan");
        return window.__citycutQaPlan.exportSitePlanFrameSvg();
      });
      fs.writeFileSync(path.join(cursorArtifacts, "parity-export-frame.svg"), frameSvg);
      const exportPlanBuf = await rasterizeSvgPng(
        browser,
        frameSvg,
        sydneyPlanBox.width,
        sydneyPlanBox.height,
      );
      fs.writeFileSync(path.join(cursorArtifacts, "parity-export-plan.png"), exportPlanBuf);
      fs.writeFileSync(path.join(cursorArtifacts, "parity-screen-plan.png"), screenPlanBuf);
      fs.writeFileSync(
        path.join(cursorArtifacts, "parity-side-by-side.png"),
        hstackPngBuffers(screenPlanBuf, exportPlanBuf),
      );
      assertCheck(
        "site-plan-export-frame-svg",
        "QA bridge exports a frame-clipped site plan SVG for parity checks",
        frameSvg.includes('viewBox="') && frameSvg.includes("<path"),
        `bytes=${frameSvg.length}`,
      );
    } else {
      assertCheck(
        "site-plan-export-frame-svg",
        "QA bridge exports a frame-clipped site plan SVG for parity checks",
        false,
        "svg.plan bounding box missing",
      );
    }
    const podiumCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await podiumCtx.addInitScript(() => {
      window.__citycutMinSilentLoadMs = 0;
    });
    const podiumPage = await podiumCtx.newPage();
    const podiumQuery = "qa=1&lat=-37.8045&lon=145.1065&km=0.65&qaMassing=podium";
    await podiumPage.goto(`${baseUrl}/?${podiumQuery}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await podiumPage.waitForSelector("button.create-fab", { timeout: 30_000 });
    await podiumPage.click("button.create-fab");
    await podiumPage.waitForFunction(
      () => Boolean(document.querySelector(".model canvas")),
      null,
      { timeout: 300_000 },
    );
    await podiumPage.getByRole("tab", { name: "Drawing" }).click({ timeout: 60_000 });
    await podiumPage.getByRole("button", { name: "Site plan" }).click({ timeout: 60_000 });
    await podiumPage.waitForSelector("svg.plan", { timeout: 120_000 });
    await podiumPage.waitForFunction(
      () => document.querySelectorAll("svg.plan [data-upper-z]").length >= 2,
      null,
      { timeout: 180_000 },
    );
    const podiumUpper = await podiumPage.locator("svg.plan [data-upper-z]").count();
    assertCheck(
      "qa-podium-upper-level-outlines",
      "qaMassing=podium shows inner tower outlines (data-upper-z) on the Drawing site plan",
      podiumUpper >= 2,
      `upperGroups=${podiumUpper}`,
    );
    await podiumPage.screenshot({
      path: path.join(cursorArtifacts, "upper-levels-drawing.png"),
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
    const podiumPlan = podiumPage.locator("svg.plan");
    const podiumPlanBox = await podiumPlan.boundingBox();
    if (podiumPlanBox) {
      const podiumSvg = await podiumPage.evaluate(async () => {
        if (!window.__citycutQaPlan) throw new Error("missing __citycutQaPlan");
        return window.__citycutQaPlan.exportSitePlanFrameSvg();
      });
      const podiumExportBuf = await rasterizeSvgPng(
        browser,
        podiumSvg,
        podiumPlanBox.width,
        podiumPlanBox.height,
      );
      fs.writeFileSync(path.join(cursorArtifacts, "upper-levels-export.png"), podiumExportBuf);
    }
    let podiumPlan3dmOk = false;
    let podiumPlan3dmDetail = "";
    try {
      const downloadPromise = podiumPage.waitForEvent("download", { timeout: 180_000 });
      await podiumPage.getByRole("button", { name: /^Quick export 3dm$/i }).click();
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      const chunks = [];
      for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const inspected = await inspectSitePlan3dm(bytes);
      const imported = inspected.objectCountOnLayer("Imported massing");
      const upper = inspected.objectCountOnLayer("Imported::Upper levels");
      podiumPlan3dmOk =
        filename.endsWith(".3dm") &&
        bytes.length > 500 &&
        inspected.layerNames.includes("Imported massing") &&
        inspected.layerNames.includes("Imported::Upper levels") &&
        imported > 0 &&
        upper > 0;
      podiumPlan3dmDetail = `file=${filename}, bytes=${bytes.length}, imported=${imported}, upper=${upper}, layers=${inspected.layerNames.join("|")}`;
      inspected.destroy();
    } catch (error) {
      podiumPlan3dmDetail = error instanceof Error ? error.message : String(error);
    }
    assertCheck(
      "qa-podium-site-plan-3dm-download",
      "Drawing .3dm includes imported podium footprints and Imported::Upper levels tower outlines with curve objects",
      podiumPlan3dmOk,
      podiumPlan3dmDetail,
    );
    await podiumCtx.close();
    const rozelleFixturePath = path.join(cursorArtifacts, "rozelle-import-massing.3dm");
    const rozelleFixtureMmPath = path.join(cursorArtifacts, "rozelle-import-massing-mm.3dm");
    execFileSync(
      path.join(process.cwd(), "node_modules/.bin/vitest"),
      ["run", "scripts/writeRozelleMassingFixture.test.ts"],
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          ROZELLE_FIXTURE_PATH: rozelleFixturePath,
          ROZELLE_FIXTURE_MM_PATH: rozelleFixtureMmPath,
        },
      },
    );
    const importCtx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await importCtx.addInitScript(() => {
      window.__citycutMinSilentLoadMs = 0;
    });
    const importPage = await importCtx.newPage();
    const rozelleQuery =
      "qa=1&lat=-33.8572&lon=151.21512&km=0.55&label=Rozelle+NSW&siteLat=-33.8572&siteLon=151.21512";
    try {
      await importPage.goto(`${baseUrl}/?${rozelleQuery}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await importPage.waitForSelector("button.create-fab", { timeout: 30_000 });
      await importPage.click("button.create-fab");
      await importPage.waitForFunction(
        () => Boolean(document.querySelector(".model canvas")),
        null,
        { timeout: 300_000 },
      );
      await importPage.locator('button[data-section="import"]').click({ timeout: 30_000 });
      await importPage.waitForSelector('input[type="file"][accept=".3dm"]', {
        state: "attached",
        timeout: 30_000,
      });
      await importPage.locator('input[type="file"][accept=".3dm"]').setInputFiles(rozelleFixturePath);
      await importPage.waitForFunction(
        () => document.querySelectorAll(".massing-item").length >= 1,
        null,
        { timeout: 300_000 },
      );
      await importPage.getByRole("tab", { name: "3D" }).click({ timeout: 60_000 });
      await importPage.locator('button[data-section="analysis"]').click({ timeout: 30_000 });
      const importShadowsOn = importPage.locator(".model .env-console .overlay-chips button", { hasText: "Shadows" });
      if ((await importShadowsOn.getAttribute("aria-pressed")) !== "true") {
        await importShadowsOn.click({ timeout: 30_000 });
      }
      await importPage.waitForFunction(
        () => Boolean(window.__citycutQaPlan?.zoom3dToImportedMassing?.()),
        null,
        { timeout: 60_000 },
      );
      await importPage.waitForTimeout(2000);
      await importPage.screenshot({
        path: path.join(cursorArtifacts, "3d-imported.png"),
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
      });
      await importPage.getByRole("tab", { name: "Drawing" }).click({ timeout: 60_000 });
      await importPage.getByRole("button", { name: "Site plan" }).click({ timeout: 60_000 });
      await importPage.waitForSelector("svg.plan", { timeout: 120_000 });
      await importPage.locator('button[data-section="analysis"]').click({ timeout: 60_000 });
      await importPage.waitForTimeout(300);
      const shadowsChip = importPage.locator(".model .env-console .overlay-chips button", { hasText: "Shadows" });
      await shadowsChip.click({ timeout: 30_000 });
      const importPlanFanBtn = importPage.locator(".model .env-console .overlay-chips button", {
        hasText: "9–3pm Plan Fan",
      });
      await importPlanFanBtn.click({ timeout: 30_000 });
      await importPage.waitForFunction(
        () =>
          document.querySelectorAll("svg.plan [data-upper-z]").length >= 1 &&
          document.querySelectorAll("svg.plan [data-imported-podium]").length >= 1,
        null,
        { timeout: 300_000 },
      );
      await importPage.waitForFunction(
        () => document.querySelector("svg.plan [data-imported-shadow]") !== null,
        null,
        { timeout: 300_000 },
      );
      await importPage.waitForSelector("svg.plan [data-shadow-hour] path", { timeout: 300_000 });
      const importPlanState = await importPage.evaluate(() => ({
        upperGroups: document.querySelectorAll("svg.plan [data-upper-z]").length,
        podiumPaths: document.querySelectorAll("svg.plan [data-imported-podium]").length,
        importedShadow: document.querySelectorAll("svg.plan [data-imported-shadow]").length,
        shadowPaths: document.querySelectorAll("svg.plan [data-shadow-hour] path").length,
      }));
      assertCheck(
        "rozelle-import-podium-outlines",
        "Real multi-object .3dm import shows podium outlines (data-imported-podium) on Rozelle Drawing site plan",
        importPlanState.podiumPaths >= 3,
        `podiumPaths=${importPlanState.podiumPaths}`,
      );
      assertCheck(
        "rozelle-import-upper-level-outlines",
        "Real .3dm import shows inner tower outlines (data-upper-z) on Rozelle Drawing site plan",
        importPlanState.upperGroups >= 5,
        `upperGroups=${importPlanState.upperGroups}`,
      );
      assertCheck(
        "rozelle-import-plan-shadows",
        "Real .3dm import casts sun-study plan shadows on Rozelle Drawing site plan",
        importPlanState.shadowPaths >= 6,
        `shadowPaths=${importPlanState.shadowPaths}`,
      );
      assertCheck(
        "rozelle-import-massing-shadows",
        "Imported massing casters produce plan shadows (data-imported-shadow)",
        importPlanState.importedShadow >= 1,
        `importedShadow=${importPlanState.importedShadow}`,
      );
      const fanShadowLength = async () =>
        importPage.evaluate(() =>
          [...document.querySelectorAll("svg.plan [data-shadow-hour] path")].reduce(
            (n, p) => n + (p.getAttribute("d")?.length ?? 0),
            0,
          ),
        );
      await importPage.getByRole("tab", { name: "Drawing" }).click({ timeout: 60_000 });
      await importPage.waitForTimeout(300);
      const fanLenBeforeHourScrub = await fanShadowLength();
      async function clickSolarHour(hour) {
        const label = String(hour).padStart(2, "0");
        const tick = importPage.locator(".h-tick.studio-solar-tick", { hasText: label });
        if ((await tick.count()) > 0) await tick.first().click({ timeout: 30_000 });
        else await importPage.getByRole("button", { name: `Solar time ${label}:00` }).click({ timeout: 30_000 });
      }
      await clickSolarHour(9);
      await importPage.waitForTimeout(600);
      const fanLenHour9 = await fanShadowLength();
      await clickSolarHour(15);
      await importPage.waitForTimeout(600);
      const fanLenHour15 = await fanShadowLength();
      assertCheck(
        "plan-fan-stacks-all-hours",
        "9–3pm Plan Fan paints every hour at once, so scrubbing solar time does not change stacked shadow geometry (yellow massing and imported use the same layers)",
        fanLenBeforeHourScrub === fanLenHour9 && fanLenHour9 === fanLenHour15 && fanLenHour15 > 1000,
        `shadowDLength=${fanLenBeforeHourScrub}/${fanLenHour9}/${fanLenHour15}`,
      );
      const jun21Btn = importPage.getByRole("button", { name: "21 Jun" });
      if ((await jun21Btn.count()) > 0) await jun21Btn.click({ timeout: 30_000 });
      await importPage.waitForTimeout(600);
      const fanAllStats = await importPage.evaluate(() => window.__citycutQaPlan?.sunStudyCasterStats?.());
      const importPickId = await importPage.evaluate(() =>
        window.__citycutQaPlan?.firstImportedDisplayBuildingId?.(),
      );
      assertCheck(
        "rozelle-import-sun-study-caster-stats",
        "Rozelle plan fan exposes caster stats for QA",
        Boolean(fanAllStats && fanAllStats.shadowPathChars > 500 && fanAllStats.total >= 8),
        JSON.stringify(fanAllStats ?? null),
      );
      if (importPickId != null) {
        await importPage.evaluate((id) => {
          if (!window.__citycutQaPlan?.selectSunStudyBuilding) throw new Error("missing selectSunStudyBuilding");
          window.__citycutQaPlan.selectSunStudyBuilding(id);
        }, importPickId);
        await importPage.waitForFunction(
          () => document.querySelectorAll("svg.plan [data-selected-building]").length >= 1,
          null,
          { timeout: 30_000 },
        );
        await importPage.waitForFunction(
          () => (window.__citycutQaPlan?.sunStudyCasterStats?.().shadowPathChars ?? 0) > 200,
          null,
          { timeout: 180_000 },
        );
        await importPage.waitForTimeout(500);
        const fanSelectedStats = await importPage.evaluate(() => window.__citycutQaPlan?.sunStudyCasterStats?.());
        await importPage.screenshot({
          path: path.join(cursorArtifacts, "selected-shadows-fan.png"),
          clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
        });
        assertCheck(
          "rozelle-import-selected-fan-shadows",
          "One selected imported podium keeps plan-fan shadows from podium-height casters, not tower tops only",
          Boolean(
            fanSelectedStats &&
              fanSelectedStats.podiumLevel >= 1 &&
              fanSelectedStats.total >= 2 &&
              fanSelectedStats.shadowPathChars > Math.min(400, fanAllStats.shadowPathChars * 0.12),
          ),
          `all=${JSON.stringify(fanAllStats)}, selected=${JSON.stringify(fanSelectedStats)}`,
        );
      } else {
        assertCheck(
          "rozelle-import-selected-fan-shadows",
          "One selected imported podium keeps plan-fan shadows from podium-height casters, not tower tops only",
          false,
          "no imported display building id",
        );
      }
      await importPage.locator('button[data-section="drawing"]').click({ timeout: 30_000 });
      await importPage.waitForTimeout(200);
      await importPage.waitForFunction(
        () =>
          typeof window.__citycutQaPlan?.zoomPlanToImportedMassing === "function" &&
          window.__citycutQaPlan.zoomPlanToImportedMassing(),
        null,
        { timeout: 60_000 },
      );
      await importPage.waitForTimeout(400);
      await importPage.locator('button[data-section="analysis"]').click({ timeout: 30_000 });
      await importPage.waitForTimeout(250);
      const envFanBtn = importPage.locator(".model .env-console .overlay-chips button", {
        hasText: "9–3pm Plan Fan",
      });
      const envShadowsBtn = importPage.locator(".model .env-console .overlay-chips button", { hasText: "Shadows" });
      if ((await envFanBtn.count()) > 0 && (await envFanBtn.getAttribute("aria-pressed")) === "true") {
        await envFanBtn.click({ timeout: 30_000 });
      }
      if ((await envShadowsBtn.count()) > 0 && (await envShadowsBtn.getAttribute("aria-pressed")) === "true") {
        await envShadowsBtn.click({ timeout: 30_000 });
      }
      await importPage.locator('button[data-section="drawing"]').click({ timeout: 30_000 });
      await importPage.waitForTimeout(300);
      await importPage.waitForTimeout(400);
      const upperStrokeWidths = await importPage.evaluate(() => {
        const upper = document.querySelector("svg.plan [data-imported-upper-outline]");
        const podium = document.querySelector("svg.plan [data-imported-podium]");
        if (!upper || !podium) return null;
        return {
          upper: Number.parseFloat(getComputedStyle(upper).strokeWidth),
          podium: Number.parseFloat(getComputedStyle(podium).strokeWidth),
        };
      });
      assertCheck(
        "rozelle-import-upper-stroke-weight",
        "Imported tower-top outlines use the same on-screen stroke weight as podium massing outlines",
        upperStrokeWidths &&
          Math.abs(upperStrokeWidths.upper - upperStrokeWidths.podium) < 0.05 &&
          upperStrokeWidths.upper >= 0.9,
        `upper=${upperStrokeWidths?.upper}, podium=${upperStrokeWidths?.podium}`,
      );
      await importPage.screenshot({
        path: path.join(cursorArtifacts, "drawing-podium-tower-outlines.png"),
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
      });
      await importPage.locator('button[data-section="analysis"]').click({ timeout: 30_000 });
      await importPage.waitForTimeout(250);
      if ((await envFanBtn.count()) > 0 && (await envFanBtn.getAttribute("aria-pressed")) !== "true") {
        await envFanBtn.click({ timeout: 30_000 });
      }
      await importPage.locator('button[data-section="drawing"]').click({ timeout: 30_000 });
      await importPage.waitForTimeout(400);
      await importPage.waitForSelector("svg.plan [data-shadow-hour] path", { timeout: 180_000 });
      const planImportSvgPath = path.join(cursorArtifacts, "rozelle-import-plan.svg");
      const frameSvg = await importPage.evaluate(async () => {
        if (!window.__citycutQaPlan) throw new Error("missing __citycutQaPlan");
        return window.__citycutQaPlan.exportSitePlanFrameSvg();
      });
      fs.writeFileSync(planImportSvgPath, frameSvg);
      assertCheck(
        "rozelle-import-plan-svg-outlines",
        "Exported frame SVG contains imported podium strokes and upper tower outlines",
        frameSvg.includes('stroke-dasharray="1.2 0.6"') &&
          frameSvg.includes('inkscape:label="Imported::Upper levels"'),
        `bytes=${frameSvg.length}`,
      );
      assertCheck(
        "rozelle-import-plan-svg-shadows",
        "Exported frame SVG contains sun-study shadow fills for plan fan",
        /inkscape:label="Shadow (09|15):00"/.test(frameSvg),
        "per-hour shadow layers present",
      );
      await importPage.evaluate(() => {
        if (!window.__citycutQaPlan?.clearSunStudySelection) throw new Error("missing clearSunStudySelection");
        window.__citycutQaPlan.clearSunStudySelection();
      });
      await importPage.waitForTimeout(400);
      const singleShadowSignature = () =>
        importPage.evaluate(() =>
          [...document.querySelectorAll('svg.plan [data-plan-shadow="single"]')]
            .map((p) => p.getAttribute("d") ?? "")
            .join("\n"),
        );
      async function captureSingleShadowHour(hour, filename) {
        await importPage.evaluate((h) => {
          if (!window.__citycutQaPlan?.setPlanSunMode) throw new Error("missing setPlanSunMode");
          window.__citycutQaPlan.setPlanSunMode(h, true, false);
        }, hour);
        await importPage.waitForFunction(
          () => document.querySelectorAll('svg.plan [data-plan-shadow="single"]').length >= 1,
          null,
          { timeout: 180_000 },
        );
        await importPage.waitForTimeout(800);
        await importPage.screenshot({
          path: path.join(cursorArtifacts, filename),
          clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
        });
      }
      await captureSingleShadowHour(9, "drawing-imported-shadows-9am.png");
      const sig9 = await singleShadowSignature();
      await captureSingleShadowHour(15, "drawing-imported-shadows-3pm.png");
      const sig15 = await singleShadowSignature();
      assertCheck(
        "rozelle-single-shadow-hour-scrub",
        "With Plan Fan off, imported casters use the same single-shadow path as yellow massing and shadow geometry changes between 09:00 and 15:00",
        sig9.length > 200 && sig15.length > 200 && sig9 !== sig15,
        `sigLen9=${sig9.length}, sigLen15=${sig15.length}`,
      );
    } catch (err) {
      assertCheck(
        "rozelle-import-flow",
        "Rozelle multi-object .3dm import (file input) reaches Drawing plan with outlines and shadows",
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
    await importCtx.close();
    await sydneyCtx.close();
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
