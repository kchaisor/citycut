import type { WindPeriodId } from "./windRose";
import { DEFAULT_WIND_LBM_FLOW, type WindLbmFlowSettings } from "./windLbm/types";

export const WIND_ENABLED_KEY = "citycut.wind.enabled";
export const WIND_PERIOD_KEY = "citycut.wind.period";
export const WIND_SHOW_ROSE_KEY = "citycut.wind.showRose";
export const WIND_FLOW_PLAYING_KEY = "citycut.wind.planFlowPlaying";
export const WIND_FLOW_HEATMAP_KEY = "citycut.wind.planFlowHeatmap";
export const WIND_FLOW_DIRECTION_KEY = "citycut.wind.planFlowDirection";
export const WIND_FLOW_SPEED_KEY = "citycut.wind.planFlowSpeed";

export type WindViewSettings = {
  enabled: boolean;
  period: WindPeriodId;
  showRose: boolean;
  planFlowPlaying: boolean;
  planFlowHeatmap: boolean;
  planFlowDirectionDeg: number | null;
  planFlowSpeedScale: number;
};

export const DEFAULT_WIND_SETTINGS: WindViewSettings = {
  enabled: false,
  period: "annual",
  showRose: true,
  planFlowPlaying: DEFAULT_WIND_LBM_FLOW.playing,
  planFlowHeatmap: DEFAULT_WIND_LBM_FLOW.showHeatmap,
  planFlowDirectionDeg: DEFAULT_WIND_LBM_FLOW.directionDeg,
  planFlowSpeedScale: DEFAULT_WIND_LBM_FLOW.speedScale,
};

export function windSettingsForModelOpen(storage: Storage): WindViewSettings {
  return { ...readStoredWindSettings(storage), enabled: false };
}

export function readStoredWindSettings(storage: Storage): WindViewSettings {
  try {
    const enabled = storage.getItem(WIND_ENABLED_KEY);
    const period = storage.getItem(WIND_PERIOD_KEY);
    const showRose = storage.getItem(WIND_SHOW_ROSE_KEY);
    const planFlowPlaying = storage.getItem(WIND_FLOW_PLAYING_KEY);
    const planFlowHeatmap = storage.getItem(WIND_FLOW_HEATMAP_KEY);
    const planFlowDirection = storage.getItem(WIND_FLOW_DIRECTION_KEY);
    const planFlowSpeed = storage.getItem(WIND_FLOW_SPEED_KEY);
    return {
      enabled: enabled === "1",
      period: isWindPeriod(period) ? period : "annual",
      showRose: showRose !== "0",
      planFlowPlaying: planFlowPlaying !== "0",
      planFlowHeatmap: planFlowHeatmap === "1",
      planFlowDirectionDeg: parseDirection(planFlowDirection),
      planFlowSpeedScale: parseSpeedScale(planFlowSpeed),
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

function parseDirection(raw: string | null): number | null {
  if (!raw || raw === "auto") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function parseSpeedScale(raw: string | null): number {
  const n = raw == null ? 1 : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.35, n));
}

export function writeStoredWindSettings(storage: Storage, settings: WindViewSettings): void {
  try {
    storage.setItem(WIND_ENABLED_KEY, settings.enabled ? "1" : "0");
    storage.setItem(WIND_PERIOD_KEY, settings.period);
    storage.setItem(WIND_SHOW_ROSE_KEY, settings.showRose ? "1" : "0");
    storage.setItem(WIND_FLOW_PLAYING_KEY, settings.planFlowPlaying ? "1" : "0");
    storage.setItem(WIND_FLOW_HEATMAP_KEY, settings.planFlowHeatmap ? "1" : "0");
    storage.setItem(
      WIND_FLOW_DIRECTION_KEY,
      settings.planFlowDirectionDeg == null ? "auto" : String(settings.planFlowDirectionDeg),
    );
    storage.setItem(WIND_FLOW_SPEED_KEY, String(settings.planFlowSpeedScale));
  } catch {
  }
}

export function windLbmFlowFromSettings(settings: WindViewSettings): WindLbmFlowSettings {
  return {
    playing: settings.planFlowPlaying,
    directionDeg: settings.planFlowDirectionDeg,
    speedScale: settings.planFlowSpeedScale,
    showHeatmap: settings.planFlowHeatmap,
    showRose: settings.showRose,
  };
}
