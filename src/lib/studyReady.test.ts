import { afterEach, describe, expect, it, vi } from "vitest";
import type { NamedViewSnapshot } from "./namedViews";
import { studiesReady, waitForStudies, type StudyReadySignals } from "./studyReady";

const READY: StudyReadySignals = {
  sunHoursPending: false,
  sunHoursSurfacesPending: false,
  windPlanApplicable: true,
  windPlanReady: true,
};

function study(over: { sunHours?: boolean; plan?: boolean }): NamedViewSnapshot {
  return {
    tab: "3d",
    view: { projection: over.plan ? "plan" : "iso", corner: "ne", freeRotate: false },
    analyses: { solar: true, wind: Boolean(over.plan), view: false },
    solar: { sunHours: Boolean(over.sunHours) },
  } as unknown as NamedViewSnapshot;
}

afterEach(() => vi.useRealTimers());

describe("studiesReady", () => {
  it("holds while sun hours are pending and releases when they finish", () => {
    const view = study({ sunHours: true });
    expect(studiesReady(view, { ...READY, sunHoursPending: true })).toBe(false);
    expect(studiesReady(view, { ...READY, sunHoursSurfacesPending: true })).toBe(false);
    expect(studiesReady(view, READY)).toBe(true);
  });

  it("holds the wind plan view until the field is ready, and ignores it off Plan or without data", () => {
    expect(studiesReady(study({ plan: true }), { ...READY, windPlanReady: false })).toBe(false);
    expect(studiesReady(study({ plan: true }), { ...READY, windPlanReady: false, windPlanApplicable: false })).toBe(true);
    expect(studiesReady(study({}), { ...READY, windPlanReady: false })).toBe(true);
  });

  it("does not wait on sun hours when the study is off", () => {
    expect(studiesReady(study({}), { ...READY, sunHoursPending: true })).toBe(true);
  });
});

describe("waitForStudies", () => {
  it("resolves only after the signals flip to ready", async () => {
    vi.useFakeTimers();
    let signals: StudyReadySignals = { ...READY, sunHoursPending: true, windPlanReady: false };
    const done = vi.fn();
    void waitForStudies(study({ sunHours: true, plan: true }), () => signals).then(done);
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).not.toHaveBeenCalled();
    signals = { ...READY, windPlanReady: false };
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).not.toHaveBeenCalled();
    signals = READY;
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("gives up at the cap instead of hanging", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void waitForStudies(study({ sunHours: true }), () => ({ ...READY, sunHoursPending: true }), { capMs: 5000 }).then(done);
    await vi.advanceTimersByTimeAsync(4000);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
