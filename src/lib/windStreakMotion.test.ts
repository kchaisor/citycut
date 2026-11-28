import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  advanceWindClock,
  windMotionPaused,
  readWindAnimateAnyway,
  writeWindAnimateAnyway,
  WIND_ANIMATE_ANYWAY_KEY,
} from "./windStreakMotion";

describe("windStreakMotion storage", () => {
  it("persists animate-anyway override", () => {
    const bag: Record<string, string> = {};
    const storage: Storage = {
      get length() {
        return Object.keys(bag).length;
      },
      clear() {
        for (const key of Object.keys(bag)) delete bag[key];
      },
      getItem(key: string) {
        return bag[key] ?? null;
      },
      key(index: number) {
        return Object.keys(bag)[index] ?? null;
      },
      removeItem(key: string) {
        delete bag[key];
      },
      setItem(key: string, value: string) {
        bag[key] = value;
      },
    };

    expect(readWindAnimateAnyway(storage)).toBe(false);
    writeWindAnimateAnyway(storage, true);
    expect(storage.getItem(WIND_ANIMATE_ANYWAY_KEY)).toBe("1");
    expect(readWindAnimateAnyway(storage)).toBe(true);
  });
});

describe("shared wind pause", () => {
  it("runs by default and starts paused under reduced motion until Animate anyway", () => {
    expect(windMotionPaused({ systemReduced: false, animateAnyway: false, userPaused: null })).toBe(false);
    expect(windMotionPaused({ systemReduced: true, animateAnyway: false, userPaused: null })).toBe(true);
    expect(windMotionPaused({ systemReduced: true, animateAnyway: true, userPaused: null })).toBe(false);
  });

  it("lets Play and Pause override either default", () => {
    expect(windMotionPaused({ systemReduced: false, animateAnyway: false, userPaused: true })).toBe(true);
    expect(windMotionPaused({ systemReduced: true, animateAnyway: false, userPaused: false })).toBe(false);
    expect(windMotionPaused({ systemReduced: true, animateAnyway: true, userPaused: true })).toBe(true);
  });

  it("freezes the clock while paused and carries on from the same time on Play", () => {
    const clock = { seconds: 0 };
    advanceWindClock(clock, 0.5, false);
    advanceWindClock(clock, 0.25, false);
    expect(clock.seconds).toBe(0.75);
    expect(advanceWindClock(clock, 2, true)).toBe(0.75);
    expect(advanceWindClock(clock, 2, true)).toBe(0.75);
    expect(advanceWindClock(clock, 0.25, false)).toBe(1);
  });

  it("drives the ground-flow and the diagram arrows from the one pause flag", () => {
    const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    const scene = source("src/components/Scene3D.tsx");
    expect(scene).toContain("animateStreaks={windAnimateStreaks}");
    expect(scene).toContain("animate={active && windAnimateStreaks}");
    expect(scene).toContain("windAnimate={(windLayers.groundFlow || windLayers.streams) && windAnimateStreaks}");
    expect(source("src/components/model/ModelPageViewportTabs.tsx")).toContain("windAnimateStreaks={windMotion.animateStreaks}");
    const ground = source("src/components/GroundWindFlow.tsx");
    expect(ground).toContain("const frozen = !animate;");
    expect(ground).not.toContain("prefers-reduced-motion");
    expect(source("src/components/WindDiagramStreams.tsx")).toContain("advanceWindClock(clock.current, Math.min(delta, MAX_FRAME_DT), !animateRef.current)");
  });
});
