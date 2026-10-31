import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import {
  changedFraction,
  cropGray,
  describeSegment,
  detectStartIndex,
  cumulativeProgress,
  firstSustained,
  popEvents,
  meanAbsDiff,
  meanLuma,
  motionSegments,
  parseArgs,
  parseDurationMs,
  settleIndex,
} from "./match-reference-lib.mjs";

const CHROME_PATH = fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;
const CHROME_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--disable-dev-shm-usage",
  "--no-sandbox",
];
const AW = 180;
const AH = 112;
const TW = 480;
const TH = 300;
const REGIONS = {
  topHud: { x: 0.25, y: 0, w: 0.5, h: 0.1 },
  left: { x: 0, y: 0.08, w: 0.18, h: 0.8 },
  right: { x: 0.82, y: 0.08, w: 0.18, h: 0.8 },
  bottom: { x: 0.2, y: 0.88, w: 0.6, h: 0.12 },
  center: { x: 0.3, y: 0.25, w: 0.4, h: 0.5 },
};

const args = parseArgs(process.argv.slice(2));
if (!args.ref || !args.target) {
  console.log(
    "Usage: npm run match:ref -- --ref <video|URL> --target <video|URL> [--start-action citycut|click:<selector>|none] [--ref-start-action ...] [--start-event <window event>] [--capture-mode stepped|video] [--interval 100ms] [--duration 6s] [--capture 15s] [--viewport 1440x900] [--out dir] [--rows 30]",
  );
  process.exit(1);
}
const intervalMs = parseDurationMs(args.interval, 100);
const durationMs = parseDurationMs(args.duration, 6000);
const captureMs = parseDurationMs(args.capture, Math.max(durationMs + 8000, 12000));
const [VW, VH] = String(args.viewport ?? "1440x900").split("x").map(Number);
const outDir = path.resolve(args.out ?? `match-ref-out/${new Date().toISOString().replace(/[:.]/g, "-")}`);
const rowsWanted = Number(args.rows ?? 30);
const preFrames = Number(args.pre ?? 3);
fs.mkdirSync(outDir, { recursive: true });

const isUrl = (s) => /^https?:\/\//.test(s);
const fps = 1000 / intervalMs;
const normFilter = (w, h) =>
  `fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;

function probe(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:format=duration",
    "-of", "json", file,
  ]).toString();
  const j = JSON.parse(out);
  const s = j.streams[0];
  const [n, d] = s.r_frame_rate.split("/").map(Number);
  return { width: s.width, height: s.height, fps: n / d, durationMs: Number(j.format.duration) * 1000 };
}

async function runStartAction(page, action) {
  if (!action || action === "none") return;
  if (action === "citycut") {
    await page.waitForSelector(".select .frame", { timeout: 30000 });
    await page.waitForSelector("button.create-fab", { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    return { click: "button.create-fab" };
  }
  if (action.startsWith("click:")) {
    const sel = action.slice(6);
    await page.waitForSelector(sel, { timeout: 30000 });
    await page.waitForTimeout(1500);
    return { click: sel };
  }
  throw new Error(`Unknown start action: ${action}`);
}

async function captureUrl(url, action, name) {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: CHROME_ARGS });
  const stepped = (args["capture-mode"] ?? "stepped") === "stepped";
  const videoDir = path.join(outDir, `${name}-raw`);
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 1,
    ...(stepped ? {} : { recordVideo: { dir: videoDir, size: { width: VW, height: VH } } }),
  });
  const page = await context.newPage();
  if (stepped) await page.clock.install();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const plan = await runStartAction(page, action);
  const startEvent = args["start-event"];
  await page.evaluate((ev) => {
    window.__matchRefClickAt = Date.now();
    if (ev)
      window.addEventListener(ev, () => {
        window.__matchRefEventAt = Date.now();
      });
  }, startEvent ?? null);
  const file = path.join(outDir, `${name}.mp4`);
  if (stepped) {
    const framesDir = path.join(outDir, `${name}-steps`);
    fs.mkdirSync(framesDir, { recursive: true });
    await page.clock.pauseAt(await page.evaluate(() => Date.now()));
    const clickAt = await page.evaluate(() => Date.now());
    if (plan?.click) await page.click(plan.click);
    const maxSteps = Math.round(captureMs / intervalMs) + Math.round(60000 / intervalMs);
    let eventStep;
    let i = 0;
    for (; i < maxSteps; i++) {
      await page.screenshot({ path: path.join(framesDir, `${String(i + 1).padStart(5, "0")}.png`) });
      await page.clock.runFor(intervalMs);
      await page.waitForTimeout(startEvent && eventStep === undefined ? 40 : 15);
      if (startEvent && eventStep === undefined && (await page.evaluate(() => window.__matchRefEventAt))) eventStep = i + 1;
      const anchor = startEvent ? eventStep : 0;
      if (anchor !== undefined && i + 1 >= anchor + Math.round((durationMs + 1500) / intervalMs)) break;
      if (!startEvent && i + 1 >= Math.round(captureMs / intervalMs)) break;
    }
    await context.close();
    await browser.close();
    execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", path.join(framesDir, "%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", file]);
    fs.rmSync(framesDir, { recursive: true, force: true });
    const anchorMs = (eventStep ?? 0) * intervalMs;
    return { file, trimStartMs: Math.max(0, anchorMs - 1000), eventAtMs: eventStep === undefined ? undefined : anchorMs, clickAtVirtualMs: clickAt, steps: i + 1, mode: "stepped" };
  }
  if (plan?.click) await page.click(plan.click);
  const actionAtMs = Date.now() - t0;
  let eventAtMs;
  if (startEvent) {
    await page.waitForFunction(() => window.__matchRefEventAt, null, { timeout: 120000, polling: 50 });
    eventAtMs = (await page.evaluate(() => window.__matchRefEventAt)) - t0;
    await page.waitForTimeout(durationMs + 3000);
  } else await page.waitForTimeout(captureMs);
  const video = page.video();
  await context.close();
  await browser.close();
  const webm = file.replace(/\.mp4$/, ".webm");
  fs.renameSync(await video.path(), webm);
  fs.rmSync(videoDir, { recursive: true, force: true });
  const anchor = eventAtMs ?? actionAtMs;
  return { file: webm, trimStartMs: Math.max(0, anchor - 1000), actionAtMs, eventAtMs, mode: "realtime-video" };
}

async function acquire(src, action, name) {
  if (isUrl(src) && !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(src)) return { ...(await captureUrl(src, action, name)), kind: "url", src };
  return { file: path.resolve(src), trimStartMs: parseDurationMs(args[`${name}-trim`], 0), kind: "video", src };
}

function extractGray(file, trimMs) {
  const r = spawnSync(
    "ffmpeg",
    ["-v", "error", "-ss", String(trimMs / 1000), "-i", file, "-vf", `${normFilter(AW, AH)},format=gray`, "-f", "rawvideo", "-"],
    { maxBuffer: 1 << 30 },
  );
  if (r.status !== 0) throw new Error(r.stderr.toString());
  const buf = r.stdout;
  const size = AW * AH;
  const frames = [];
  for (let o = 0; o + size <= buf.length; o += size) frames.push(new Uint8Array(buf.subarray(o, o + size)));
  return frames;
}

function extractThumbs(file, trimMs, dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(trimMs / 1000), "-i", file, "-vf", normFilter(TW, TH), path.join(dir, "%05d.png")]);
}

function analyseSequence(frames) {
  const baseline = frames[0];
  const fromBaseline = frames.map((f) => meanAbsDiff(baseline, f));
  const t0 = detectStartIndex(fromBaseline);
  const motion = frames.map((f, i) => (i === 0 ? 0 : meanAbsDiff(frames[i - 1], f)));
  const luma = frames.map(meanLuma);
  return { fromBaseline, t0, motion, luma };
}

function regionEvents(frames, t0, endIdx) {
  const out = {};
  for (const [name, rect] of Object.entries(REGIONS)) {
    const crops = frames.map((f) => cropGray(f, AW, AH, rect));
    const base = crops[Math.max(0, t0 - 1)];
    const series = crops.map((c) => meanAbsDiff(base, c));
    const end = Math.min(endIdx, series.length - 1);
    const peak = Math.max(...series.slice(t0, end + 1), 0);
    const first = peak > 0.01 ? firstSustained(series, Math.max(0.01, 0.15 * peak), t0) : -1;
    const settle = peak > 0.01 ? settleIndex(series.slice(0, end + 1), Math.max(0.005, 0.05 * peak), t0) : -1;
    out[name] = {
      firstChangeMs: first < 0 ? null : (first - t0) * intervalMs,
      settleMs: settle < 0 ? null : (settle - t0) * intervalMs,
      peakChange: +peak.toFixed(4),
    };
  }
  return out;
}

function summarise(seq, frames, n) {
  const start = seq.t0;
  const end = Math.min(frames.length - 1, start + n);
  const motion = seq.motion.slice(0, end + 1);
  const segs = motionSegments(motion.slice(start), {}).map((s) => ({ start: s.start + start, end: s.end + start }));
  const overall = segs.length ? { start: segs[0].start, end: segs[segs.length - 1].end } : null;
  return {
    t0Index: start,
    segments: segs.map((s) => describeSegment(motion, s, intervalMs, start)),
    overall: overall ? describeSegment(motion, overall, intervalMs, start) : null,
    regions: regionEvents(frames, start, end),
    popEventsMs: popEvents(motion).filter((i) => i >= start).map((i) => (i - start) * intervalMs),
    lumaStart: +seq.luma[start].toFixed(4),
    lumaEnd: +seq.luma[end].toFixed(4),
    lumaMin: +Math.min(...seq.luma.slice(start, end + 1)).toFixed(4),
  };
}

function svgChart(series, title) {
  const W = 1400;
  const H = 520;
  const pad = 50;
  const n = Math.max(...series.map((s) => s.values.length));
  const colours = ["#e4572e", "#2e86ab", "#f3a712", "#4c956c", "#8e44ad", "#555555"];
  const lines = series
    .map((s, k) => {
      const max = s.max ?? Math.max(...s.values, 1e-9);
      const pts = s.values
        .map((v, i) => `${pad + (i / (n - 1)) * (W - 2 * pad)},${H - pad - (v / max) * (H - 2 * pad)}`)
        .join(" ");
      return `<polyline fill="none" stroke="${colours[k % colours.length]}" stroke-width="2" ${s.dash ? 'stroke-dasharray="6 4"' : ""} points="${pts}"/><text x="${pad + 10}" y="${pad + 18 * (k + 1)}" fill="${colours[k % colours.length]}" font-size="14">${s.label}</text>`;
    })
    .join("");
  const ticks = Array.from({ length: Math.floor(((n - 1) * intervalMs) / 500) + 1 }, (_, i) => {
    const x = pad + ((i * 500) / intervalMs / (n - 1)) * (W - 2 * pad);
    return `<line x1="${x}" y1="${pad}" x2="${x}" y2="${H - pad}" stroke="#ddd"/><text x="${x - 12}" y="${H - pad + 18}" font-size="12">${((i * 500 - preFrames * intervalMs) / 1000).toFixed(1)}s</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#fff;font-family:sans-serif"><text x="${pad}" y="28" font-size="18">${title}</text>${ticks}<rect x="${pad}" y="${pad}" width="${W - 2 * pad}" height="${H - 2 * pad}" fill="none" stroke="#999"/>${lines}</svg>`;
}

const dataUri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;

async function renderHtml(browser, html, file, width) {
  const page = await browser.newPage({ viewport: { width, height: 400 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

async function main() {
  console.log(`out: ${outDir}`);
  const ref = await acquire(args.ref, args["ref-start-action"] ?? "none", "ref");
  const tgt = await acquire(args.target, args["start-action"] ?? "citycut", "target");
  const refInfo = probe(ref.file);
  const tgtInfo = probe(tgt.file);
  const refFrames = extractGray(ref.file, ref.trimStartMs);
  const tgtFrames = extractGray(tgt.file, tgt.trimStartMs);
  const refSeq = analyseSequence(refFrames);
  const tgtSeq = analyseSequence(tgtFrames);
  if (refSeq.t0 < 0 || tgtSeq.t0 < 0) throw new Error(`No visual change found (ref t0=${refSeq.t0}, target t0=${tgtSeq.t0})`);
  const n = Math.round(durationMs / intervalMs);
  const pairs = [];
  for (let i = -preFrames; i <= n; i++) {
    const ri = refSeq.t0 + i;
    const ti = tgtSeq.t0 + i;
    const rf = refFrames[Math.min(Math.max(ri, 0), refFrames.length - 1)];
    const tf = tgtFrames[Math.min(Math.max(ti, 0), tgtFrames.length - 1)];
    pairs.push({
      tMs: i * intervalMs,
      refIndex: Math.min(Math.max(ri, 0), refFrames.length - 1),
      targetIndex: Math.min(Math.max(ti, 0), tgtFrames.length - 1),
      refClamped: ri < 0 || ri >= refFrames.length,
      targetClamped: ti < 0 || ti >= tgtFrames.length,
      meanAbsDiff: +meanAbsDiff(rf, tf).toFixed(5),
      changedPct: +(changedFraction(rf, tf) * 100).toFixed(2),
      refMotion: +refSeq.motion[Math.min(Math.max(ri, 0), refFrames.length - 1)].toFixed(5),
      targetMotion: +tgtSeq.motion[Math.min(Math.max(ti, 0), tgtFrames.length - 1)].toFixed(5),
      refLuma: +refSeq.luma[Math.min(Math.max(ri, 0), refFrames.length - 1)].toFixed(4),
      targetLuma: +tgtSeq.luma[Math.min(Math.max(ti, 0), tgtFrames.length - 1)].toFixed(4),
    });
  }
  fs.writeFileSync(
    path.join(outDir, "frames.csv"),
    [Object.keys(pairs[0]).join(","), ...pairs.map((p) => Object.values(p).join(","))].join("\n") + "\n",
  );
  const refSummary = summarise(refSeq, refFrames, n);
  const tgtSummary = summarise(tgtSeq, tgtFrames, n);
  const report = {
    method: {
      intervalMs,
      durationMs,
      analysisSize: `${AW}x${AH} gray`,
      normalisation: `each source scaled to fit ${VW}x${VH} aspect (letterbox pad), then ${TW}x${TH} thumbs and ${AW}x${AH} analysis frames`,
      alignment:
        "t=0 is the first frame whose mean abs grey difference from frame 0 exceeds max(3x baseline noise, noise + 10% of peak) for 2 consecutive frames, computed independently per sequence",
      segments:
        "frame-to-frame mean abs difference above max(2x median, median + 8% of peak), gaps <= 2 frames merged; easing = best RMSE fit of normalised cumulative motion against named curves",
    },
    ref: { src: ref.src, kind: ref.kind, ...refInfo, trimStartMs: ref.trimStartMs, t0Ms: refSeq.t0 * intervalMs + ref.trimStartMs, ...refSummary },
    target: { src: tgt.src, kind: tgt.kind, ...tgtInfo, trimStartMs: tgt.trimStartMs, captureMode: tgt.mode, steps: tgt.steps, actionAtMs: tgt.actionAtMs, eventAtMs: tgt.eventAtMs, t0Ms: tgtSeq.t0 * intervalMs + tgt.trimStartMs, ...tgtSummary },
    score: {
      meanAbsDiff: +(pairs.reduce((s, p) => s + p.meanAbsDiff, 0) / pairs.length).toFixed(5),
      meanChangedPct: +(pairs.reduce((s, p) => s + p.changedPct, 0) / pairs.length).toFixed(2),
      finalFrameChangedPct: pairs[pairs.length - 1].changedPct,
    },
    frames: pairs,
  };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  const refThumbs = path.join(outDir, "thumbs-ref");
  const tgtThumbs = path.join(outDir, "thumbs-target");
  extractThumbs(ref.file, ref.trimStartMs, refThumbs);
  extractThumbs(tgt.file, tgt.trimStartMs, tgtThumbs);
  const diffDir = path.join(outDir, "thumbs-diff");
  fs.mkdirSync(diffDir, { recursive: true });
  const step = Math.max(1, Math.ceil(pairs.length / rowsWanted));
  const rows = pairs.filter((_, i) => i % step === 0 || i === pairs.length - 1);
  const thumb = (dir, idx) => path.join(dir, String(idx + 1).padStart(5, "0") + ".png");
  for (const r of rows) {
    const a = thumb(refThumbs, Math.min(r.refIndex, fs.readdirSync(refThumbs).length - 1));
    const b = thumb(tgtThumbs, Math.min(r.targetIndex, fs.readdirSync(tgtThumbs).length - 1));
    r.refPng = a;
    r.targetPng = b;
    r.diffPng = path.join(diffDir, `${r.tMs}.png`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", a, "-i", b, "-filter_complex", "[0][1]blend=all_mode=difference,eq=contrast=3", r.diffPng]);
  }
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ["--no-sandbox"] });
  const perSheet = 12;
  const sheets = [];
  for (let s = 0; s * perSheet < rows.length; s++) {
    const chunk = rows.slice(s * perSheet, (s + 1) * perSheet);
    const html = `<body style="margin:0;background:#111;color:#eee;font:13px sans-serif"><div style="display:grid;grid-template-columns:90px ${TW}px ${TW}px ${TW}px;gap:4px;padding:6px">
<b>t</b><b>reference</b><b>target</b><b>|diff| x3</b>
${chunk
  .map(
    (r) =>
      `<div>${(r.tMs / 1000).toFixed(2)}s<br>diff ${r.changedPct}%<br>mad ${r.meanAbsDiff}</div><img src="${dataUri(r.refPng)}"><img src="${dataUri(r.targetPng)}"><img src="${dataUri(r.diffPng)}">`,
  )
  .join("")}</div></body>`;
    const file = path.join(outDir, `contact-sheet-${String(s + 1).padStart(2, "0")}.png`);
    await renderHtml(browser, html, file, 90 + TW * 3 + 30);
    sheets.push(file);
  }
  const chart = svgChart(
    [
      { label: "aligned diff (changed %)", values: pairs.map((p) => p.changedPct), max: 100 },
      { label: "ref motion", values: pairs.map((p) => p.refMotion), max: Math.max(...pairs.map((p) => Math.max(p.refMotion, p.targetMotion))) },
      { label: "target motion", values: pairs.map((p) => p.targetMotion), max: Math.max(...pairs.map((p) => Math.max(p.refMotion, p.targetMotion))) },
      { label: "ref progress", values: [...cumulativeProgress(pairs.map((p, i) => (i < preFrames ? 0 : p.refMotion)))], max: 1, dash: true },
      { label: "target progress", values: [...cumulativeProgress(pairs.map((p, i) => (i < preFrames ? 0 : p.targetMotion)))], max: 1, dash: true },
      { label: "ref luma / target luma (grey)", values: pairs.map((p) => p.refLuma - p.targetLuma + 0.5), max: 1 },
    ],
    `Reference vs target, aligned at first visual change (t=0), ${intervalMs}ms interval`,
  );
  await renderHtml(browser, `<body style="margin:0">${chart}</body>`, path.join(outDir, "diff-over-time.png"), 1400);
  await browser.close();
  report.contactSheets = sheets;
  report.chart = path.join(outDir, "diff-over-time.png");
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  const fmt = (x) => (x == null ? "-" : `${(x / 1000).toFixed(2)}s`);
  for (const [k, v] of [["ref", report.ref], ["target", report.target]]) {
    console.log(`\n${k}: ${v.width}x${v.height} t0=${fmt(v.t0Ms)} overall ${fmt(v.overall?.startMs)}..${fmt(v.overall?.endMs)} (${fmt(v.overall?.durationMs)}) ${v.overall?.easing}`);
    v.segments.forEach((s, i) => console.log(`  seg${i + 1} ${fmt(s.startMs)}..${fmt(s.endMs)} dur ${fmt(s.durationMs)} peak ${fmt(s.peakMs)} t50 ${fmt(s.t50Ms)} ${s.easing} rmse ${s.easingRmse.toFixed(3)}`));
    for (const [r, e] of Object.entries(v.regions)) console.log(`  ${r}: first ${fmt(e.firstChangeMs)} settle ${fmt(e.settleMs)} peak ${e.peakChange}`);
    console.log(`  single-frame pops at: ${v.popEventsMs.map(fmt).join(", ") || "-"}`);
    console.log(`  luma start ${v.lumaStart} min ${v.lumaMin} end ${v.lumaEnd}`);
  }
  console.log(`\nscore: ${JSON.stringify(report.score)}\nsheets: ${sheets.join(", ")}\nchart: ${report.chart}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
