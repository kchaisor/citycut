import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { mgaCrs } from "../lib/crsZone";
import { disposeObject } from "../lib/buildCity";
import type { ImportedMassing, MassingPlacement } from "../lib/massingImport";
import {
  deleteStoredMassing,
  loadStoredMassing,
  massingCutKey,
  saveStoredMassing,
  updateStoredMassing,
} from "../lib/massingStore";
import { sampleTerrain } from "../lib/terrain";
import type { CityModel } from "../types";

type Runtime = typeof import("../lib/massingRuntime");
let runtimePromise: Promise<Runtime> | null = null;
function loadRuntime(): Promise<Runtime> {
  runtimePromise ??= import("../lib/massingRuntime");
  return runtimePromise;
}

/** Same limit as MASSING_MAX_FILE_BYTES, checked before the runtime loads. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

async function parseBytes(bytes: Uint8Array) {
  const runtime = await loadRuntime();
  return runtime.parseMassing3dm(await runtime.loadRhino(), bytes);
}

/**
 * Imported .3dm massing for one cut: parsed geometry, placement, IndexedDB persistence,
 * the three group for the scene and live warnings. Nothing here touches the camera.
 */
export function useImportedMassing(model: Pick<CityModel, "center" | "sideM" | "terrain">) {
  const zone = mgaCrs(model.center.lon).zone;
  const cutKey = massingCutKey(model.center);
  const [imported, setImported] = useState<ImportedMassing[]>([]);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rt, setRt] = useState<Runtime | null>(null);
  useEffect(() => {
    if (imported.length > 0 && !rt) void loadRuntime().then(setRt);
  }, [imported.length, rt]);

  const groundAt = useCallback(
    (east: number, north: number) =>
      model.terrain ? sampleTerrain(model.terrain, east, north, model.sideM) : 0,
    [model.terrain, model.sideM],
  );

  useEffect(() => {
    let cancelled = false;
    setImported([]);
    void loadStoredMassing(cutKey).then(async (rows) => {
      const out: ImportedMassing[] = [];
      for (const row of rows) {
        try {
          const parsed = await parseBytes(new Uint8Array(row.bytes));
          out.push({ ...parsed, id: row.id, name: row.name, fileBytes: row.bytes.byteLength, mode: row.mode, placement: row.placement, visible: row.visible });
        } catch {
          // A stored file that no longer parses is skipped, not deleted.
        }
      }
      if (!cancelled) setImported(out);
    });
    return () => {
      cancelled = true;
    };
  }, [cutKey]);

  const importFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!/\.3dm$/i.test(file.name)) {
        setError("Only Rhino .3dm files can be imported.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setError("This file is over 50 MB. Reduce the model or mesh it more coarsely in Rhino.");
        return;
      }
      setBusy(true);
      try {
        const buffer = await file.arrayBuffer();
        const parsed = await parseBytes(new Uint8Array(buffer));
        const runtime = await loadRuntime();
        setRt(runtime);
        const limit = runtime.canAddMassing(imported, parsed.triangles);
        if (limit) throw new runtime.MassingImportError(limit);
        const local = runtime.looksLocal(parsed);
        const item: ImportedMassing = {
          ...parsed,
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          fileBytes: file.size,
          mode: local ? "click" : "mga",
          placement: local ? runtime.cutCentrePlacement(model, zone, groundAt(0, 0)) : runtime.mgaPlacement(parsed),
          visible: true,
        };
        setImported((prev) => [...prev, item]);
        if (local) setPlacingId(item.id);
        await saveStoredMassing({
          id: item.id,
          cutKey,
          name: item.name,
          bytes: buffer,
          mode: item.mode,
          placement: item.placement,
          visible: true,
          addedAt: new Date().toISOString(),
        });
      } catch (err) {
        const known = runtimePromise && err instanceof (await runtimePromise).MassingImportError;
        setError(known ? (err as Error).message : "This .3dm could not be read.");
      } finally {
        setBusy(false);
      }
    },
    [imported, model, zone, groundAt, cutKey],
  );

  const patch = useCallback((id: string, next: Partial<Pick<ImportedMassing, "mode" | "placement" | "visible">>) => {
    setImported((prev) => prev.map((item) => (item.id === id ? { ...item, ...next } : item)));
    void updateStoredMassing(id, next);
  }, []);

  const setPlacement = useCallback(
    (id: string, placement: MassingPlacement) => patch(id, { placement, mode: "click" }),
    [patch],
  );

  const setMode = useCallback(
    (id: string, mode: "mga" | "click") => {
      const item = imported.find((entry) => entry.id === id);
      if (!item || !rt) return;
      if (mode === "mga") {
        setPlacingId(null);
        patch(id, { mode, placement: rt.mgaPlacement(item) });
      } else {
        setPlacingId(id);
        patch(id, { mode });
      }
    },
    [imported, patch, rt],
  );

  const snapToGround = useCallback(
    (id: string) => {
      const item = imported.find((entry) => entry.id === id);
      if (!item || !rt) return;
      const [east, north] = rt.mgaToLocal(item.placement.e, item.placement.n, model.center, zone);
      setPlacement(id, { ...item.placement, base: groundAt(east, north) });
    },
    [imported, model.center, zone, groundAt, setPlacement, rt],
  );

  const resetToMga = useCallback((id: string) => setMode(id, "mga"), [setMode]);

  const toggleVisible = useCallback(
    (id: string) => {
      const item = imported.find((entry) => entry.id === id);
      if (item) patch(id, { visible: !item.visible });
    },
    [imported, patch],
  );

  const remove = useCallback((id: string) => {
    setImported((prev) => prev.filter((item) => item.id !== id));
    setPlacingId((current) => (current === id ? null : current));
    void deleteStoredMassing(id);
  }, []);

  /** Click-to-place: base centre goes where the click hit (ground or roof). */
  const onScenePoint = useMemo(() => {
    if (!placingId || !rt) return null;
    return (east: number, north: number, up: number) => {
      const item = imported.find((entry) => entry.id === placingId);
      setPlacingId(null);
      if (!item) return;
      const [e, n] = rt.projectLocal([east, north], model.center, zone);
      setPlacement(item.id, { ...item.placement, e, n, base: up });
    };
  }, [placingId, imported, model.center, zone, setPlacement, rt]);

  const group = useMemo(
    () => (rt ? rt.buildMassingGroup(imported, model.center, zone) : null),
    [rt, imported, model.center, zone],
  );
  useLayoutEffect(() => () => {
    if (group) disposeObject(group);
  }, [group]);

  const warnings = useMemo(() => {
    const out = new Map<string, string[]>();
    if (!rt) return out;
    for (const item of imported) {
      out.set(item.id, rt.massingWarnings(item, rt.placedLocal(item, item.placement, model.center, zone), model, zone));
    }
    return out;
  }, [rt, imported, model, zone]);

  /** Plan footprints for Drawing (site plan, figure-ground, exploded axo) and their .ai exports. */
  const drawingBuildings = useMemo(
    () => {
      if (!rt || !imported.some((item) => item.visible)) return [];
      try {
        return rt.massingDrawingBuildings(imported, model.center, zone);
      } catch (err) {
        // A footprint that fails to union must not take the model page down; the 3D view still shows it.
        console.warn("[CityCut] imported massing footprint failed", err);
        return [];
      }
    },
    [rt, imported, model.center, zone],
  );

  const forExport = useMemo(() => imported.filter((item) => item.visible), [imported]);

  return {
    imported,
    forExport,
    drawingBuildings,
    group,
    warnings,
    placingId,
    busy,
    error,
    importFile,
    setMode,
    setPlacement,
    snapToGround,
    resetToMga,
    toggleVisible,
    remove,
    onScenePoint,
  };
}
