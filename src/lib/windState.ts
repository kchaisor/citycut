import { isDesignWindId, type DesignWindId } from "./windDesignWinds";
import type { WindPeriodId } from "./windRose";

export const WIND_ENABLED_KEY = "citycut.wind.enabled";
export const WIND_PERIOD_KEY = "citycut.wind.period";
export const WIND_SHOW_ROSE_KEY = "citycut.wind.showRose";
export const WIND_DESIGN_WIND_KEY = "citycut.wind.designWind";

export type WindViewSettings = {
  enabled: boolean;
  period: WindPeriodId;
  designWind: DesignWindId | null;
  showRose: boolean;
};

export const DEFAULT_WIND_SETTINGS: WindViewSettings = {
  enabled: false,
  period: "annual",
  designWind: null,
  showRose: true,
};

export function windSettingsForModelOpen(storage: Storage): WindViewSettings {
  return { ...readStoredWindSettings(storage), enabled: true };
}

export function readStoredWindSettings(storage: Storage): WindViewSettings {
  try {
    const enabled = storage.getItem(WIND_ENABLED_KEY);
    const period = storage.getItem(WIND_PERIOD_KEY);
    const showRose = storage.getItem(WIND_SHOW_ROSE_KEY);
    const designWind = storage.getItem(WIND_DESIGN_WIND_KEY);
    return {
      enabled: enabled === "1",
      period: isWindPeriod(period) ? period : "annual",
      designWind: isDesignWindId(designWind) ? designWind : null,
      showRose: showRose !== "0",
    };
  } catch {
    return DEFAULT_WIND_SETTINGS;
  }
}

function isWindPeriod(value: string | null): value is WindPeriodId {
  if (!value) return false;
  if (value === "annual" || value === "summer" || value === "autumn" || value === "winter" || value === "spring") {
    return true;
  }
  return /^month-(1[0-2]|[1-9])$/.test(value);
}

export function writeStoredWindSettings(storage: Storage, settings: WindViewSettings): void {
  try {
    storage.setItem(WIND_ENABLED_KEY, settings.enabled ? "1" : "0");
    storage.setItem(WIND_PERIOD_KEY, settings.period);
    if (settings.designWind) storage.setItem(WIND_DESIGN_WIND_KEY, settings.designWind);
    else storage.removeItem(WIND_DESIGN_WIND_KEY);
    storage.setItem(WIND_SHOW_ROSE_KEY, settings.showRose ? "1" : "0");
  } catch {
  }
}

export function withWindSeason(settings: WindViewSettings, period: WindPeriodId): WindViewSettings {
  return { ...settings, enabled: true, period, designWind: null };
}

export function withDesignWind(settings: WindViewSettings, designWind: DesignWindId): WindViewSettings {
  return { ...settings, enabled: true, period: "annual", designWind };
}
