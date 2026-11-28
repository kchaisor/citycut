import type { NamedViewSnapshot } from "./namedViews";

export type StudyReadySignals = {
  sunHoursPending: boolean;
  sunHoursSurfacesPending: boolean;
  windPlanApplicable: boolean;
  windPlanReady: boolean;
  explodeSettled: boolean;
};

export const STUDY_READY_CAP_MS = 60_000;
export const STUDY_READY_POLL_MS = 50;
const STABLE_POLLS = 2;

export function explodeSettledOnCanvas(wantExploded: boolean): boolean {
  if (typeof document === "undefined") return true;
  const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-explode-progress]");
  if (!canvas) return true;
  const progress = Number(canvas.dataset.explodeProgress);
  return wantExploded ? canvas.dataset.exploded === "1" && progress === 1 : progress === 0;
}

export function studiesReady(snapshot: NamedViewSnapshot, signals: StudyReadySignals): boolean {
  if (snapshot.tab === "3d" && !signals.explodeSettled) return false;
  if (snapshot.tab === "3d" && snapshot.solar.sunHours && (signals.sunHoursPending || signals.sunHoursSurfacesPending)) {
    return false;
  }
  const windPlanShown = snapshot.tab === "3d" && snapshot.view.projection === "plan" && snapshot.analyses.wind && snapshot.windPlan.view === "map";
  if (windPlanShown && signals.windPlanApplicable && !signals.windPlanReady) return false;
  return true;
}

export function waitForStudies(
  snapshot: NamedViewSnapshot,
  read: () => StudyReadySignals,
  options: { capMs?: number; pollMs?: number } = {},
): Promise<void> {
  const capMs = options.capMs ?? STUDY_READY_CAP_MS;
  const pollMs = options.pollMs ?? STUDY_READY_POLL_MS;
  return new Promise((resolve) => {
    const started = Date.now();
    let stable = 0;
    const poll = () => {
      stable = studiesReady(snapshot, read()) ? stable + 1 : 0;
      if (stable >= STABLE_POLLS || Date.now() - started >= capMs) {
        resolve();
        return;
      }
      setTimeout(poll, pollMs);
    };
    poll();
  });
}

export function waitForExplodeSettled(
  wantExploded: boolean,
  options: { capMs?: number; pollMs?: number } = {},
): Promise<void> {
  const capMs = options.capMs ?? STUDY_READY_CAP_MS;
  const pollMs = options.pollMs ?? STUDY_READY_POLL_MS;
  return new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      if (explodeSettledOnCanvas(wantExploded) || Date.now() - started >= capMs) {
        resolve();
        return;
      }
      setTimeout(poll, pollMs);
    };
    poll();
  });
}
