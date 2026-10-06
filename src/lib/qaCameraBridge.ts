/** Dev / QA only: programmatic perspective camera when `?qa=1` is in the URL. */
export type QaCameraPose = {
  eye: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

export type QaCameraBridge = {
  setCamera: (pose: QaCameraPose) => void;
  projectToScreen: (world: { x: number; y: number; z: number }) => { x: number; y: number } | null;
};

export type QaSiteSnapshot = {
  parcelPfi: string | null | undefined;
  parcelSpi: string | null | undefined;
  siteBuildingIds: number[];
  overlaps: { id: number; overlapPercent: number; selected: boolean }[];
};

declare global {
  interface Window {
    __citycutQa?: QaCameraBridge;
    __citycutQaSite?: QaSiteSnapshot;
  }
}

export function qaModeFromSearch(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("qa") === "1";
}

export function registerQaCameraBridge(bridge: QaCameraBridge | null): void {
  if (typeof window === "undefined") return;
  if (bridge) window.__citycutQa = bridge;
  else delete window.__citycutQa;
}
