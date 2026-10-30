export const EASINGS = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeOutExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

export function parseDurationMs(v, fallback) {
  if (v === undefined || v === true) return fallback;
  const m = String(v).trim().match(/^([\d.]+)\s*(ms|s)?$/);
  if (!m) throw new Error(`Bad duration: ${v}`);
  return m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]);
}

export function meanAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n / 255;
}

export function changedFraction(a, b, threshold = 24) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let c = 0;
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) > threshold) c++;
  return c / n;
}

export function meanLuma(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length / 255 : 0;
}

export function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectStartIndex(diffsFromBaseline, { minFrames = 2, threshold } = {}) {
  const base = diffsFromBaseline.slice(0, Math.max(2, Math.min(5, diffsFromBaseline.length)));
  const noise = Math.max(...base, 0);
  const peak = Math.max(...diffsFromBaseline, 0);
  const thr = threshold ?? Math.max(noise * 3, noise + 0.1 * (peak - noise), 0.002);
  for (let i = 0; i < diffsFromBaseline.length; i++) {
    let ok = true;
    for (let k = 0; k < minFrames; k++) {
      const v = diffsFromBaseline[i + k];
      if (v === undefined || v <= thr) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

export function motionSegments(motion, { threshold, mergeGap = 1, minLength = 2 } = {}) {
  const sorted = [...motion].sort((x, y) => x - y);
  const floor = sorted[Math.floor(0.1 * (sorted.length - 1))] ?? 0;
  const p90 = sorted[Math.floor(0.9 * (sorted.length - 1))] ?? 0;
  const thr = threshold ?? Math.max(floor * 3, 0.15 * p90, 0.0015);
  const raw = [];
  let start = -1;
  for (let i = 0; i <= motion.length; i++) {
    const on = i < motion.length && motion[i] > thr;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      raw.push([start, i - 1]);
      start = -1;
    }
  }
  const merged = [];
  for (const seg of raw) {
    const last = merged[merged.length - 1];
    if (last && seg[0] - last[1] - 1 <= mergeGap) last[1] = seg[1];
    else merged.push([...seg]);
  }
  return merged.filter(([a, b]) => b - a + 1 >= minLength).map(([a, b]) => ({ start: a, end: b }));
}

export function cumulativeProgress(motion) {
  const total = motion.reduce((s, v) => s + v, 0);
  let acc = 0;
  return motion.map((v) => {
    acc += v;
    return total > 0 ? acc / total : 0;
  });
}

export function fitEasing(progress) {
  const n = progress.length;
  if (n < 2) return { best: "linear", rmse: 0, scores: {} };
  const scores = {};
  for (const [name, fn] of Object.entries(EASINGS)) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      s += (progress[i] - fn(t)) ** 2;
    }
    scores[name] = Math.sqrt(s / n);
  }
  const best = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
  return { best: best[0], rmse: best[1], scores };
}

export function describeSegment(motion, seg, intervalMs, t0Index = 0) {
  const slice = motion.slice(seg.start, seg.end + 1);
  const prog = [0, ...cumulativeProgress(slice)];
  const fit = fitEasing(prog);
  const peakIdx = slice.indexOf(Math.max(...slice));
  return {
    startMs: (seg.start - t0Index) * intervalMs,
    endMs: (seg.end + 1 - t0Index) * intervalMs,
    durationMs: (seg.end - seg.start + 1) * intervalMs,
    peakMs: (seg.start + peakIdx - t0Index) * intervalMs,
    energy: slice.reduce((s, v) => s + v, 0),
    easing: fit.best,
    easingRmse: fit.rmse,
    easingScores: fit.scores,
    t50Ms: (seg.start - t0Index + prog.findIndex((p) => p >= 0.5)) * intervalMs,
  };
}

export function firstSustained(series, threshold, from = 0, minFrames = 2) {
  for (let i = from; i < series.length; i++) {
    let ok = true;
    for (let k = 0; k < minFrames; k++) {
      if (!(series[i + k] > threshold)) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

export function settleIndex(series, tolerance, from = 0) {
  const final = series[series.length - 1];
  for (let i = series.length - 1; i >= from; i--) {
    if (Math.abs(series[i] - final) > tolerance) return i + 1;
  }
  return from;
}

export function cropGray(buf, w, h, rect) {
  const x0 = Math.round(rect.x * w);
  const y0 = Math.round(rect.y * h);
  const x1 = Math.round((rect.x + rect.w) * w);
  const y1 = Math.round((rect.y + rect.h) * h);
  const out = new Uint8Array(Math.max(0, (x1 - x0) * (y1 - y0)));
  let o = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[o++] = buf[y * w + x];
  return out;
}

export function popEvents(motion, factor = 3) {
  const out = [];
  for (let i = 1; i < motion.length - 1; i++) {
    const around = Math.max(motion[i - 1], motion[i + 1]);
    if (motion[i] > factor * Math.max(around, 0.002)) out.push(i);
  }
  return out;
}
