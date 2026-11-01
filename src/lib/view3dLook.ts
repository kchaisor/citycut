export type View3dLook = "default" | "signalTrace";

export const VIEW3D_LOOK_KEY = "citycut.view3d.look";

export const DEFAULT_VIEW3D_LOOK: View3dLook = "default";

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function readStoredView3dLook(storage: KeyValueStore): View3dLook {
  try {
    const raw = storage.getItem(VIEW3D_LOOK_KEY);
    if (raw === "signalTrace") return "signalTrace";
    return DEFAULT_VIEW3D_LOOK;
  } catch {
    return DEFAULT_VIEW3D_LOOK;
  }
}

export function writeStoredView3dLook(storage: KeyValueStore, look: View3dLook): void {
  try {
    storage.setItem(VIEW3D_LOOK_KEY, look);
  } catch {
  }
}

export function signalTraceLookActive(look: View3dLook): boolean {
  return look === "signalTrace";
}
