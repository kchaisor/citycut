import type { NamedViewSnapshot } from "./namedViews";

export type StudyReadySignals = {
  sunHoursPending: boolean;
  sunHoursSurfacesPending: boolean;
  windPlanApplicable: boolean;
  windPlanReady: boolean;
};

export const STUDY_READY_CAP_MS = 60_000;
export const STUDY_READY_POLL_MS = 50;
const STABLE_POLLS = 2;

export function studiesReady(snapshot: NamedViewSnapshot, signals: StudyReadySignals): boolean {
  if (snapshot.tab === "3d" && snapshot.solar.sunHours && (signals.sunHoursPending || signals.sunHoursSurfacesPending)) {
    return false;
  }
  const windPlanShown = snapshot.tab === "3d" && snapshot.view.projection === "plan" && snapshot.analyses.wind;
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
