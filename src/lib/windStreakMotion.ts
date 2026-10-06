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
    // ignore
  }
}

export function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type WindStreakMotion = {
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

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setSystemReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setAnimateAnyway = useCallback((value: boolean) => {
    setAnimateAnywayState(value);
    writeWindAnimateAnyway(window.localStorage, value);
  }, []);

  const streaksPaused = systemReduced && !animateAnyway;
  return {
    streaksPaused,
    animateStreaks: !streaksPaused,
    animateAnyway,
    setAnimateAnyway,
  };
}
