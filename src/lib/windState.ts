import { isDesignWindId, type DesignWindId } from "./windDesignWinds";
import type { WindPeriodId } from "./windRose";

export const WIND_ENABLED_KEY = "citycut.wind.enabled";
export const WIND_PERIOD_KEY = "citycut.wind.period";
export const WIND_DESIGN_WIND_KEY = "citycut.wind.designWind";

export type WindViewSettings = {
  enabled: boolean;
  period: WindPeriodId;
  designWind: DesignWindId | null;
};

export const DEFAULT_WIND_SETTINGS: WindViewSettings = {
  enabled: false,
  period: "annual",
  designWind: null,
};

export function windSettingsForModelOpen(storage: Storage): WindViewSettings {
  return { ...readStoredWindSettings(storage), enabled: false };
}

export function readStoredWindSettings(storage: Storage): WindViewSettings {
  try {
    const enabled = storage.getItem(WIND_ENABLED_KEY);
    const period = storage.getItem(WIND_PERIOD_KEY);
    const designWind = storage.getItem(WIND_DESIGN_WIND_KEY);
    return {
      enabled: enabled === "1",
      period: isWindPeriod(period) ? period : "annual",
      designWind: isDesignWindId(designWind) ? designWind : null,
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
  } catch {
  }
}

export function withWindSeason(settings: WindViewSettings, period: WindPeriodId): WindViewSettings {
  return { ...settings, enabled: true, period, designWind: null };
}

export function withDesignWind(settings: WindViewSettings, designWind: DesignWindId): WindViewSettings {
  return { ...settings, enabled: true, period: "annual", designWind };
}
