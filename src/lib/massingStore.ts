import type { LonLat } from "../types";
import type { MassingPlacement, MassingPlacementMode } from "./massingImport";

const DB_NAME = "citycut-massing";
const STORE = "models";

export type StoredMassing = {
  id: string;
  cutKey: string;
  name: string;
  bytes: ArrayBuffer;
  mode: MassingPlacementMode;
  placement: MassingPlacement;
  visible: boolean;
  colour?: string;
  addedAt: string;
};

export function massingCutKey(center: LonLat): string {
  return `${center.lat.toFixed(5)},${center.lon.toFixed(5)}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("cutKey", "cutKey");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function done<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function loadStoredMassing(cutKey: string): Promise<StoredMassing[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const rows = await done(db.transaction(STORE).objectStore(STORE).index("cutKey").getAll(cutKey));
    return ((rows ?? []) as StoredMassing[]).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  } finally {
    db.close();
  }
}

export async function saveStoredMassing(row: StoredMassing): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await done(db.transaction(STORE, "readwrite").objectStore(STORE).put(row));
  } finally {
    db.close();
  }
}

export async function updateStoredMassing(
  id: string,
  patch: Partial<Pick<StoredMassing, "mode" | "placement" | "visible" | "colour">>,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const row = (await done(store.get(id))) as StoredMassing | null;
    if (row) await done(store.put({ ...row, ...patch }));
  } finally {
    db.close();
  }
}

export async function deleteStoredMassing(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await done(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}
