import type { LonLat } from "../types";

export function modelCutSiteId(center: LonLat, sideM: number): string {
  return `${center.lat.toFixed(5)},${center.lon.toFixed(5)},${sideM}`;
}

export function introAlreadyPlayedForCut(playedCutId: string | null, cutId: string): boolean {
  return playedCutId !== null && playedCutId === cutId;
}

export function markIntroPlayedForCut(store: { current: string | null }, cutId: string): void {
  store.current = cutId;
}
