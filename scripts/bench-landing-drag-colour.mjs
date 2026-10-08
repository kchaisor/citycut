/**
 * Landing colour benchmark (main vs PR preview builds on :4173).
 *
 * Metrics (see metricDefinitions in QA bridge):
 * - "any": non-uniform use fill visible in the cut frame.
 * - "final": rendered fill equals post-refine landingBuildingFill per building.
 * Anchors: static = frameFirstDrawnMs ?? navStartMs; pan = panStartMs.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const label = process.argv[2] ?? "pr";
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";

const METRIC_DEFINITIONS = {
  anchorStaticMs:
    "Elapsed ms from frameFirstDrawnMs (first cut frame on screen) or navStartMs if earlier.",
  anchorPanMs: "Elapsed ms from panStartMs when panBy300 or user pan starts.",
  staticFirstAnyColourMs: "First in-frame building showing any non-uniform use fill after anchor.",
  static95PctAnyMs: "≥95% of in-frame buildings show any non-uniform use fill.",
  staticFirstFinalColourMs:
    "First in-frame building whose rendered fill equals post-refine landingBuildingFill.",
  static95PctFinalMs:
    "≥95% of in-frame buildings whose rendered fill equals post-refine landingBuildingFill.",
  panFirstAnyColourMs: "First any-colour during pan (anchorPanMs).",
  pan95AnyDuringMs: "≥95% any-colour during pan.",
  panFirstFinalColourMs: "First exact final fill during pan.",
  pan95FinalDuringMs: "≥95% exact final fill during pan.",
  pan95FinalAfterReleaseMs: "≥95% exact final fill after pan ends and live refine idles.",
};

const SPOTS = [
  { id: "east-melbourne", lat: -37.8127, lon: 144.98061, km: 1 },
  { id: "cbd", lat: -37.8136, lon: 144.9631, km: 1 },
];

const SWIFT = [
  "--use-gl=angle",
  "--use-angle=swiftshader-webgl",
  "--enable-unsafe-swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
];

async function isPrBuild(page) {
  return page.evaluate(
    () =>
      typeof window.__citycutMap?.getLayer === "function" &&
      !!window.__citycutMap.getLayer("citycut-enrichment-tiles-fill"),
  );
}

async function waitMapIdle(page, timeoutMs = 30_000) {
  await page.evaluate(
    (timeout) =>
      new Promise((resolve) => {
        const map = window.__citycutMap;
        if (!map) {
          resolve(undefined);
          return;
        }
        const timer = window.setTimeout(() => resolve(undefined), timeout);
        map.once("idle", () => {
          window.clearTimeout(timer);
          resolve(undefined);
        });
      }),
    timeoutMs,
  );
}

async function waitForInitialColour(page, pr) {
  if (pr) {
    await page.waitForFunction(
      () => (window.__citycutCutColourStats?.dragExpectedInFrame ?? 0) > 0,
      undefined,
      { timeout: 120_000 },
    );
    await waitMapIdle(page);
    return;
  }
  await page.waitForFunction(
    () => window.__citycutCutColourStats?.colourFillMs != null,
    undefined,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(320);
}

async function pollUntil(page, predicate, timeoutMs, intervalMs = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(predicate)) return Date.now() - t0;
    await page.waitForTimeout(intervalMs);
  }
  return null;
}

async function pan300Map(page) {
  const t0 = Date.now();
  await page.evaluate(() => {
    const stats = window.__citycutCutColourStats;
    if (stats) {
      stats.panStartMs = performance.now();
      stats.panFirstColourMs = null;
      stats.pan95DuringMs = null;
      stats.pan95AfterReleaseMs = null;
      stats.panFirstAnyColourMs = null;
      stats.pan95AnyDuringMs = null;
      stats.panFirstFinalColourMs = null;
      stats.pan95FinalDuringMs = null;
      stats.pan95FinalAfterReleaseMs = null;
    }
    return new Promise((resolve) => {
      const map = window.__citycutMap;
      if (!map) {
        resolve(undefined);
        return;
      }
      map.panBy([300, 0], { duration: 1000, easing: (t) => t });
      map.once("moveend", () => resolve(undefined));
    });
  });
  return Date.now() - t0;
}

function assertMetricOrder(trial, spotId, trialIndex) {
  const pairs = [
    ["staticFirstAnyColourMs", "static95PctAnyMs"],
    ["staticFirstFinalColourMs", "static95PctFinalMs"],
    ["staticFirstAnyColourMs", "static95PctFinalMs"],
    ["staticFirstFinalColourMs", "static95PctFinalMs"],
    ["panFirstAnyColourMs", "pan95AnyDuringMs"],
    ["panFirstFinalColourMs", "pan95FinalDuringMs"],
  ];
  for (const [firstKey, laterKey] of pairs) {
    const first = trial[firstKey];
    const later = trial[laterKey];
    if (first != null && later != null && first > later) {
      throw new Error(
        `${spotId} trial ${trialIndex}: ${firstKey} (${first}ms) > ${laterKey} (${later}ms)`,
      );
    }
  }
}

async function readStaticMetrics(page, pr) {
  if (pr) {
    await pollUntil(
      page,
      () => {
        const s = window.__citycutCutColourStats;
        return s?.static95PctFinalMs != null || s?.staticFirstFinalColourMs != null;
      },
      60_000,
    );
    return page.evaluate(() => {
      const s = window.__citycutCutColourStats ?? {};
      return {
        staticFirstAnyColourMs: s.staticFirstAnyColourMs,
        static95PctAnyMs: s.static95PctAnyMs,
        staticFirstFinalColourMs: s.staticFirstFinalColourMs,
        static95PctFinalMs: s.static95PctFinalMs,
        staticFirstColourMs: s.staticFirstAnyColourMs ?? s.staticFirstColourMs,
      };
    });
  }
  const staticMs = await page.evaluate(() => {
    const s = window.__citycutCutColourStats ?? {};
    if (s.colourFillMs != null && s.frameFirstDrawnMs != null) {
      return Math.round(s.colourFillMs - s.frameFirstDrawnMs);
    }
    return null;
  });
  return {
    staticFirstAnyColourMs: staticMs,
    static95PctAnyMs: staticMs,
    staticFirstFinalColourMs: staticMs,
    static95PctFinalMs: staticMs,
    staticFirstColourMs: staticMs,
  };
}

async function runTrial(page, pr) {
  await waitForInitialColour(page, pr);

  await waitMapIdle(page);

  const staticMetrics = await readStaticMetrics(page, pr);

  const fillBefore = await page.evaluate(() => window.__citycutCutColourStats?.colourFillMs ?? 0);

  let panMetrics = {
    panFirstAnyColourMs: null,
    pan95AnyDuringMs: null,
    panFirstFinalColourMs: null,
    pan95FinalDuringMs: null,
    panFirstColourMs: null,
    pan95DuringMs: null,
    pan95FinalAfterReleaseMs: null,
    pan95AfterReleaseMs: null,
  };

  const panDurationMs = await (async () => {
    const panT0 = Date.now();
    if (pr) {
      const panPromise = pan300Map(page);
      while (Date.now() - panT0 < 1100) {
        const snap = await page.evaluate(() => {
          const s = window.__citycutCutColourStats ?? {};
          const c = window.__citycutQaLandingColour?.countInFrame();
          const elapsed = s.panStartMs != null ? Math.round(performance.now() - s.panStartMs) : null;
          if (!c || elapsed == null) return null;
          const out = {};
          if (c.anyColoured > 0 && s.panFirstAnyColourMs == null) out.panFirstAnyColourMs = elapsed;
          if (c.anyFraction >= 0.95 && s.pan95AnyDuringMs == null) out.pan95AnyDuringMs = elapsed;
          if (c.finalColoured > 0 && s.panFirstFinalColourMs == null) out.panFirstFinalColourMs = elapsed;
          if (c.finalFraction >= 0.95 && s.pan95FinalDuringMs == null) out.pan95FinalDuringMs = elapsed;
          return Object.keys(out).length ? out : null;
        });
        if (snap) {
          for (const [k, v] of Object.entries(snap)) {
            if (panMetrics[k] == null) panMetrics[k] = v;
          }
        }
        await page.waitForTimeout(50);
      }
      await panPromise;
    } else {
      await pan300Map(page);
    }
    return Date.now() - panT0;
  })();

  await waitForInitialColour(page, pr);
  await waitMapIdle(page);

  if (pr) {
    const fromStats = await page.evaluate(() => {
      const s = window.__citycutCutColourStats ?? {};
      return {
        panFirstAnyColourMs: s.panFirstAnyColourMs,
        pan95AnyDuringMs: s.pan95AnyDuringMs,
        panFirstFinalColourMs: s.panFirstFinalColourMs,
        pan95FinalDuringMs: s.pan95FinalDuringMs ?? s.pan95DuringMs,
        pan95FinalAfterReleaseMs: s.pan95FinalAfterReleaseMs ?? s.pan95AfterReleaseMs,
      };
    });
    panMetrics = { ...panMetrics, ...fromStats };
    if (panMetrics.pan95FinalAfterReleaseMs == null) {
      panMetrics.pan95FinalAfterReleaseMs = await pollUntil(
        page,
        () => {
          const c = window.__citycutQaLandingColour?.countInFrame();
          return c != null && c.expected > 0 && c.finalFraction >= 0.95;
        },
        45_000,
      );
    }
  } else {
    panMetrics.pan95FinalAfterReleaseMs = await page.evaluate(async (before) => {
      const t0 = Date.now();
      while (Date.now() - t0 < 45_000) {
        if ((window.__citycutCutColourStats?.colourFillMs ?? 0) > before) {
          return Date.now() - t0;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return null;
    }, fillBefore);
  }

  panMetrics.panFirstColourMs = panMetrics.panFirstAnyColourMs;
  panMetrics.pan95DuringMs = panMetrics.pan95FinalDuringMs;
  panMetrics.pan95AfterReleaseMs = panMetrics.pan95FinalAfterReleaseMs;

  const agreement = pr
    ? await page.evaluate(() => window.__citycutQaLandingColour?.tileFinalAgreement() ?? null)
    : null;

  const stats = await page.evaluate(() => {
    const s = window.__citycutCutColourStats ?? {};
    return {
      colourFetchMs: s.colourFetchMs,
      colourEnrichmentMs: s.colourEnrichmentMs,
      colourRefineMs: s.colourRefineMs,
      dragExpectedInFrame: s.dragExpectedInFrame ?? null,
    };
  });

  const trial = {
    panDurationMs,
    ...staticMetrics,
    ...panMetrics,
    dragExpectedInFrame: stats.dragExpectedInFrame,
    tileFinalAgreement: agreement,
    colourFetchMs: stats.colourFetchMs,
    colourEnrichmentMs: stats.colourEnrichmentMs,
    colourRefineMs: stats.colourRefineMs,
  };

  return trial;
}

function mean(nums) {
  const valid = nums.filter((n) => typeof n === "number" && Number.isFinite(n));
  return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null;
}

const browser = await chromium.launch({ headless: true, args: SWIFT });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });

const results = {
  label,
  metricDefinitions: METRIC_DEFINITIONS,
  panMethod: "map.panBy([300,0], { duration: 1000 }) via __citycutMap when qa=1",
  spots: {},
  generatedAt: new Date().toISOString(),
};
const prMode = label !== "main";

for (const spot of SPOTS) {
  const url = `${base}?lat=${spot.lat}&lon=${spot.lon}&km=${spot.km}&qa=1`;
  const warmup = await context.newPage();
  await warmup.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await waitForInitialColour(warmup, prMode).catch(() => {});
  await warmup.close();

  const trials = [];
  for (let i = 0; i < 5; i++) {
    console.error(`${spot.id} trial ${i + 1}/5…`);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    let pr = false;
    if (prMode) {
      pr = await page
        .waitForFunction(
          () =>
            typeof window.__citycutMap?.getLayer === "function" &&
            !!window.__citycutMap.getLayer("citycut-enrichment-tiles-fill"),
          undefined,
          { timeout: 90_000 },
        )
        .then(() => true)
        .catch(() => false);
    }
    const trial = await runTrial(page, pr);
    assertMetricOrder(trial, spot.id, i + 1);
    trials.push(trial);
    await page.close();
  }

  const agreementRuns = trials.map((t) => t.tileFinalAgreement).filter(Boolean);
  const meanAgreement =
    agreementRuns.length > 0
      ? Math.round((10 * agreementRuns.reduce((s, a) => s + a.agreementPct, 0)) / agreementRuns.length) / 10
      : null;
  const mismatchTotals = {};
  const mismatchReasonTotals = {};
  const examples = [];
  for (const t of agreementRuns) {
    for (const [use, n] of Object.entries(t.mismatchesByUse ?? {})) {
      mismatchTotals[use] = (mismatchTotals[use] ?? 0) + n;
    }
    for (const [reason, n] of Object.entries(t.mismatchesByReason ?? {})) {
      mismatchReasonTotals[reason] = (mismatchReasonTotals[reason] ?? 0) + n;
    }
    for (const ex of t.unavoidableExamples ?? []) {
      if (examples.length < 8) examples.push(ex);
    }
  }

  results.spots[spot.id] = {
    url,
    trials,
    mean: {
      staticFirstAnyColourMs: mean(trials.map((t) => t.staticFirstAnyColourMs)),
      static95PctAnyMs: mean(trials.map((t) => t.static95PctAnyMs)),
      staticFirstFinalColourMs: mean(trials.map((t) => t.staticFirstFinalColourMs)),
      static95PctFinalMs: mean(trials.map((t) => t.static95PctFinalMs)),
      panFirstAnyColourMs: mean(trials.map((t) => t.panFirstAnyColourMs)),
      pan95AnyDuringMs: mean(trials.map((t) => t.pan95AnyDuringMs)),
      panFirstFinalColourMs: mean(trials.map((t) => t.panFirstFinalColourMs)),
      pan95FinalDuringMs: mean(trials.map((t) => t.pan95FinalDuringMs)),
      pan95FinalAfterReleaseMs: mean(trials.map((t) => t.pan95FinalAfterReleaseMs)),
      panDurationMs: mean(trials.map((t) => t.panDurationMs)),
      colourFetchMs: mean(trials.map((t) => t.colourFetchMs)),
      colourEnrichmentMs: mean(trials.map((t) => t.colourEnrichmentMs)),
      colourRefineMs: mean(trials.map((t) => t.colourRefineMs)),
      tileFinalAgreementPct: meanAgreement,
    },
    tileFinalMismatchTotalsByUse: mismatchTotals,
    tileFinalMismatchTotalsByReason: mismatchReasonTotals,
    tileFinalMismatchExamples: examples,
  };
}

await context.close();
await browser.close();

writeFileSync(`${outDir}/bench-landing-drag-colour-${label}.json`, JSON.stringify(results, null, 2));

try {
  const otherLabel = label === "main" ? "pr" : "main";
  const other = JSON.parse(readFileSync(`${outDir}/bench-landing-drag-colour-${otherLabel}.json`, "utf8"));
  writeFileSync(
    `${outDir}/bench-landing-drag-colour.json`,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        metricDefinitions: METRIC_DEFINITIONS,
        main: label === "main" ? results : other,
        pr: label === "pr" ? results : other,
      },
      null,
      2,
    ),
  );
} catch {
  writeFileSync(`${outDir}/bench-landing-drag-colour.json`, JSON.stringify(results, null, 2));
}

console.log(JSON.stringify(results, null, 2));
