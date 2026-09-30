import { DEFAULT_ISO_CORNER, isIsoCorner, type IsoCorner } from "./isoCamera";

/** Projection, corner, and free-rotate. Separate from the map frame in the URL. */
export const VIEW_STORAGE_KEY = "citycut.view";

export type ProjectionMode = "perspective" | "iso";

export type ViewMemory = {
  projection: ProjectionMode;
  corner: IsoCorner;
  freeRotate: boolean;
};

export const DEFAULT_VIEW: ViewMemory = {
  projection: "perspective",
  corner: DEFAULT_ISO_CORNER,
  freeRotate: false,
};

export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function parseStoredView(raw: string | null): ViewMemory {
  if (!raw) return { ...DEFAULT_VIEW };
  try {
    const data = JSON.parse(raw) as Partial<ViewMemory>;
    const projection: ProjectionMode = data.projection === "iso" ? "iso" : "perspective";
    const corner = isIsoCorner(data.corner) ? data.corner : DEFAULT_VIEW.corner;
    return {
      projection,
      corner,
      freeRotate: data.freeRotate === true,
    };
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

/**
 * `view=iso-sw` (and ne / nw / se) is a locked isometric corner.
 * `view=axo` is orthographic with free rotate on.
 * `view=persp` forces perspective. Anything else is ignored.
 */
export function viewFromToken(token: string | null): Partial<ViewMemory> | null {
  if (!token) return null;
  const value = token.trim().toLowerCase();
  if (value === "persp" || value === "perspective") {
    return { projection: "perspective", freeRotate: false };
  }
  if (value === "axo" || value === "axonometric") {
    return { projection: "iso", freeRotate: true };
  }
  const match = /^iso-(ne|nw|se|sw)$/.exec(value);
  if (!match || !isIsoCorner(match[1])) return null;
  return { projection: "iso", corner: match[1], freeRotate: false };
}

/** A locked isometric corner encodes as `iso-sw`. Perspective adds nothing. Free rotate is `axo`. */
export function viewToken(view: ViewMemory): string | null {
  if (view.projection === "perspective") return null;
  if (view.freeRotate) return "axo";
  return `iso-${view.corner}`;
}

/** Stored memory, then a `view` query param when that param is one we understand. */
export function resolveView(stored: string | null, search: string): ViewMemory {
  const base = parseStoredView(stored);
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const override = viewFromToken(params.get("view"));
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Sets or removes `view` and leaves lat, lon, km, and label in place.
 * `URLSearchParams` may rewrite the encoding of the other values; the frame they describe does not change.
 */
export function writeViewSearch(search: string, view: ViewMemory): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const token = viewToken(view);
  if (token) params.set("view", token);
  else params.delete("view");
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function readStoredView(storage: KeyValueStore): ViewMemory {
  try {
    return parseStoredView(storage.getItem(VIEW_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_VIEW };
  }
}

export function writeStoredView(storage: KeyValueStore, view: ViewMemory): void {
  try {
    storage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Private mode and some embedded browsers throw on localStorage.
  }
}
