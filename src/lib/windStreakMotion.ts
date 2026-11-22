import { useCallback, useEffect, useState } from "react";

export const WIND_ANIMATE_ANYWAY_KEY = "citycut.wind.animateAnyway";

export function readWindAnimateAnyway(storage: Storage): boolean {
  try {
    return storage.getItem(WIND_ANIMATE_ANYWAY_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeWindAnimateAnyway(storage: Storage, value: boolean): void {
  try {
    storage.setItem(WIND_ANIMATE_ANYWAY_KEY, value ? "1" : "0");
  } catch {
  }
}

export function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type WindPauseInput = { systemReduced: boolean; animateAnyway: boolean; userPaused: boolean | null };

export function windMotionPaused({ systemReduced, animateAnyway, userPaused }: WindPauseInput): boolean {
  return userPaused ?? (systemReduced && !animateAnyway);
}

export type WindClock = { seconds: number };

export function advanceWindClock(clock: WindClock, deltaSeconds: number, paused: boolean): number {
  if (!paused && deltaSeconds > 0) clock.seconds += deltaSeconds;
  return clock.seconds;
}

export type WindStreakMotion = {
  paused: boolean;
  setPaused: (value: boolean) => void;
  streaksPaused: boolean;
  animateStreaks: boolean;
  animateAnyway: boolean;
  setAnimateAnyway: (value: boolean) => void;
};

export function useWindStreakMotion(): WindStreakMotion {
  const [systemReduced, setSystemReduced] = useState(systemPrefersReducedMotion);
  const [animateAnyway, setAnimateAnywayState] = useState(() =>
    typeof window !== "undefined" ? readWindAnimateAnyway(window.localStorage) : false,
  );
  const [userPaused, setUserPaused] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setSystemReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setAnimateAnyway = useCallback((value: boolean) => {
    setAnimateAnywayState(value);
    setUserPaused(null);
    writeWindAnimateAnyway(window.localStorage, value);
  }, []);

  const paused = windMotionPaused({ systemReduced, animateAnyway, userPaused });
  return {
    paused,
    setPaused: setUserPaused,
    streaksPaused: paused && systemReduced && !animateAnyway,
    animateStreaks: !paused,
    animateAnyway,
    setAnimateAnyway,
  };
}
