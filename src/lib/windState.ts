import { isDesignWindId, type DesignWindId } from "./windDesignWinds";
import { isWindDaypartId, type WindDaypartId } from "./windDayparts";
import type { WindPeriodId } from "./windRose";

export const WIND_ENABLED_KEY = "citycut.wind.enabled";
export const WIND_PERIOD_KEY = "citycut.wind.period";
export const WIND_DESIGN_WIND_KEY = "citycut.wind.designWind";
export const WIND_DAYPART_KEY = "citycut.wind.daypart";
export const WIND_PLAN_VIEW_KEY = "citycut.wind.planView";

export type WindPlanViewId = "map" | "flow";

export const DEFAULT_WIND_PLAN_VIEW: WindPlanViewId = "map";

export function isWindPlanViewId(value: unknown): value is WindPlanViewId {
  return value === "map" || value === "flow";
}

export function readStoredWindPlanView(storage: Storage): WindPlanViewId {
  try {
    const stored = storage.getItem(WIND_PLAN_VIEW_KEY);
    return isWindPlanViewId(stored) ? stored : DEFAULT_WIND_PLAN_VIEW;
  } catch {
    return DEFAULT_WIND_PLAN_VIEW;
  }
}

export function writeStoredWindPlanView(storage: Storage, view: WindPlanViewId): void {
  try {
    storage.setItem(WIND_PLAN_VIEW_KEY, view);
  } catch {
  }
}

export type WindSceneLayers = { groundFlow: boolean; streams: boolean; planOverlay: boolean };

export function windSceneLayers({
  planMapOn,
  flowOn,
  streamsOn,
}: {
  planMapOn: boolean;
  flowOn: boolean;
  streamsOn: boolean;
}): WindSceneLayers {
  return { groundFlow: flowOn && !planMapOn, streams: streamsOn && !planMapOn, planOverlay: planMapOn };
}

export function windPlanMapShown({
  tab,
  projection,
  windOn,
  hasSiteWind,
  planView,
}: {
  tab: string;
  projection: string;
  windOn: boolean;
  hasSiteWind: boolean;
  planView: WindPlanViewId;
}): boolean {
  return tab === "3d" && projection === "plan" && windOn && hasSiteWind && planView === "map";
}

export type WindViewSettings = {
  enabled: boolean;
  period: WindPeriodId;
  designWind: DesignWindId | null;
  daypart: WindDaypartId;
};

export const DEFAULT_WIND_SETTINGS: WindViewSettings = {
  enabled: false,
  period: "annual",
  designWind: null,
  daypart: "all",
};

export function windSettingsForModelOpen(storage: Storage): WindViewSettings {
  return { ...readStoredWindSettings(storage), enabled: false };
}

export function readStoredWindSettings(storage: Storage): WindViewSettings {
  try {
    const enabled = storage.getItem(WIND_ENABLED_KEY);
    const period = storage.getItem(WIND_PERIOD_KEY);
    const designWind = storage.getItem(WIND_DESIGN_WIND_KEY);
    const daypart = storage.getItem(WIND_DAYPART_KEY);
    return {
      enabled: enabled === "1",
      period: isWindPeriod(period) ? period : "annual",
      designWind: isDesignWindId(designWind) ? designWind : null,
      daypart: isWindDaypartId(daypart) ? daypart : "all",
    };
  } catch {
    return DEFAULT_WIND_SETTINGS;
  }
}

export function isWindPeriod(value: string | null): value is WindPeriodId {
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
    storage.setItem(WIND_DAYPART_KEY, settings.daypart);
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

export function withWindDaypart(settings: WindViewSettings, daypart: WindDaypartId): WindViewSettings {
  return { ...settings, daypart };
}
