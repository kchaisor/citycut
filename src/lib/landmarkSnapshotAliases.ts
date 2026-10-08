/** Snapshot cut names (committed fixture) keyed by current landmark fixture name. */
export const LANDMARK_SNAPSHOT_ALIASES: Record<string, string> = {
  "Arts Centre Melbourne (Theatres Building)": "Arts Centre Spire",
  "East Melbourne terrace sample (Baker Street area)": "QV1 low-rise block East Melbourne sample",
  "RMIT Building 80 (Swanston Academic Building)": "RMIT Building 80",
  "Melbourne Water head office (Docklands)": "Docklands residential mid-rise",
};

export function snapshotCutName(fixtureName: string): string {
  return LANDMARK_SNAPSHOT_ALIASES[fixtureName] ?? fixtureName;
}
