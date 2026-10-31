import { describe, expect, it } from "vitest";
import {
  EASINGS,
  cumulativeProgress,
  detectStartIndex,
  fitEasing,
  motionSegments,
  parseArgs,
  parseDurationMs,
} from "./match-reference-lib.mjs";

describe("alignment", () => {
  it("finds the first sustained change after a noisy baseline", () => {
    const series = [0.001, 0.002, 0.001, 0.0015, 0.001, 0.001, 0.05, 0.1, 0.2, 0.3];
    expect(detectStartIndex(series)).toBe(6);
  });

  it("ignores a single-frame flicker", () => {
    const series = [0, 0, 0, 0, 0, 0.2, 0, 0, 0.2, 0.3, 0.3];
    expect(detectStartIndex(series)).toBe(8);
  });

  it("returns -1 when nothing changes", () => {
    expect(detectStartIndex([0, 0, 0, 0, 0, 0])).toBe(-1);
  });
});

describe("motion curve and easing fit", () => {
  const sampled = (fn, n) => Array.from({ length: n }, (_, i) => fn(i / (n - 1)));
  const toMotion = (p) => p.slice(1).map((v, i) => v - p[i]);

  it("recovers easeInOutCubic from its frame-to-frame motion", () => {
    const motion = toMotion(sampled(EASINGS.easeInOutCubic, 31));
    const prog = [0, ...cumulativeProgress(motion)];
    expect(fitEasing(prog).best).toBe("easeInOutCubic");
  });

  it("recovers linear", () => {
    const motion = toMotion(sampled(EASINGS.linear, 21));
    expect(fitEasing([0, ...cumulativeProgress(motion)]).best).toBe("linear");
  });

  it("splits motion into segments and merges small gaps", () => {
    const m = [0, 0, 0, 0.5, 0.5, 0, 0.5, 0.5, 0, 0, 0, 0, 0, 0.4, 0.4, 0.4, 0, 0];
    expect(motionSegments(m, { threshold: 0.1, mergeGap: 1 })).toEqual([
      { start: 3, end: 7 },
      { start: 13, end: 15 },
    ]);
  });
});

describe("cli parsing", () => {
  it("parses flags and durations", () => {
    const a = parseArgs(["--ref", "a.mp4", "--interval=100ms", "--flag", "--duration", "5s"]);
    expect(a).toEqual({ ref: "a.mp4", interval: "100ms", flag: true, duration: "5s" });
    expect(parseDurationMs(a.interval)).toBe(100);
    expect(parseDurationMs(a.duration)).toBe(5000);
  });
});

describe("pop events", () => {
  it("flags a one-frame jump such as a HUD appearing", async () => {
    const { popEvents } = await import("./match-reference-lib.mjs");
    expect(popEvents([0, 0.01, 0.01, 0.1, 0.0, 0.0])).toEqual([3]);
  });
});
