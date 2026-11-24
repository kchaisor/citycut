import { useCallback, useMemo, useState } from "react";
import { downloadBytes, fileStem } from "../../lib/download";
import { modelCutSiteId } from "../../lib/introPlayed";
import {
  applyNamedView,
  captureNamedView,
  deleteView,
  isPngExportable,
  readNamedViewsStore,
  renameView,
  saveView,
  selectedViews,
  viewPngFilenames,
  viewsForCut,
  viewsZipName,
  writeNamedViewsStore,
  type NamedView,
  type NamedViewSnapshot,
  type NamedViewsStore,
} from "../../lib/namedViews";
import { HQ_DEFAULT_SCALE as HQ_EXPORT_SCALE } from "../../lib/captureViewportPng";
import { zipStore, type ZipEntry } from "../../lib/zip";
import type { CityModel } from "../../types";
import type { SceneExporter } from "../Scene3D";
import type { NamedViewsBusy } from "../NamedViewsPanel";

const LABEL_SETTLE_FRAMES = 6;
const STORAGE_WARNING = "Views could not be saved in this browser, so they will be gone after a reload.";

type Args = {
  model: CityModel;
  getSnapshot: () => NamedViewSnapshot;
  applySnapshot: (snapshot: NamedViewSnapshot) => Promise<void>;
  getExporter: () => SceneExporter | null;
  waitUntilReady?: (snapshot: NamedViewSnapshot) => Promise<void>;
};

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

function needsLabelSettling(snapshot: NamedViewSnapshot): boolean {
  return Boolean(snapshot.analyses.view || snapshot.landmarkLabelsOn);
}

async function settle(snapshot: NamedViewSnapshot, waitUntilReady?: (snapshot: NamedViewSnapshot) => Promise<void>): Promise<void> {
  await nextFrame();
  await nextFrame();
  if (waitUntilReady) await waitUntilReady(snapshot);
  if (needsLabelSettling(snapshot)) for (let i = 0; i < LABEL_SETTLE_FRAMES; i += 1) await nextFrame();
  await nextFrame();
  await nextFrame();
}

export function useNamedViews({ model, getSnapshot, applySnapshot, getExporter, waitUntilReady }: Args) {
  const cutId = modelCutSiteId(model.center, model.sideM);
  const [store, setStore] = useState<NamedViewsStore>(() => readNamedViewsStore(window.localStorage));
  const [busy, setBusy] = useState<NamedViewsBusy>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const views = useMemo(() => viewsForCut(store, cutId), [store, cutId]);

  const commit = useCallback((next: NamedViewsStore) => {
    setStore(next);
    setWarning(writeNamedViewsStore(window.localStorage, next) ? null : STORAGE_WARNING);
  }, []);

  const save = useCallback(
    (name: string): boolean => {
      const view = captureNamedView(name, getSnapshot());
      if (!view) return false;
      commit(saveView(store, cutId, view));
      return true;
    },
    [commit, cutId, getSnapshot, store],
  );

  const rename = useCallback((id: string, name: string) => commit(renameView(store, cutId, id, name)), [commit, cutId, store]);
  const remove = useCallback((id: string) => commit(deleteView(store, cutId, id)), [commit, cutId, store]);

  const restore = useCallback(
    (id: string) => {
      const view = views.find((candidate) => candidate.id === id);
      const snapshot = view ? applyNamedView(view) : null;
      if (snapshot) void applySnapshot(snapshot);
    },
    [applySnapshot, views],
  );

  const exportViews = useCallback(
    async (list: NamedView[], mode: Exclude<NamedViewsBusy, null>, highQuality: boolean) => {
      const exportable = list.filter(isPngExportable);
      if (exportable.length === 0) {
        setWarning("Only 3D views can be exported as PNG. Pick a view saved in 3D.");
        return;
      }
      setWarning(null);
      setBusy(mode);
      const original = getSnapshot();
      try {
        const names = viewPngFilenames(exportable);
        const entries: ZipEntry[] = [];
        for (const [index, view] of exportable.entries()) {
          const snapshot = applyNamedView(view);
          if (!snapshot) throw new Error("A saved view could not be read.");
          await applySnapshot(snapshot);
          await settle(snapshot, waitUntilReady);
          const exporter = getExporter();
          if (!exporter) throw new Error("The 3D view is not ready.");
          const blob = await exporter.viewportPng(highQuality ? { transparent: true, scale: HQ_EXPORT_SCALE } : undefined);
          entries.push({ name: names[index]!, bytes: new Uint8Array(await blob.arrayBuffer()) });
        }
        if (entries.length === 1) downloadBytes(entries[0]!.name, entries[0]!.bytes, "image/png");
        else downloadBytes(viewsZipName(fileStem(model)), zipStore(entries), "application/zip");
        const skipped = list.length - exportable.length;
        if (skipped > 0) {
          setWarning(`${skipped} view${skipped === 1 ? "" : "s"} skipped: only 3D views export as PNG.`);
        }
      } catch {
        setWarning("The view PNGs could not be written.");
      } finally {
        await applySnapshot(original);
        setBusy(null);
      }
    },
    [applySnapshot, getExporter, getSnapshot, model, waitUntilReady],
  );

  const exportSelected = useCallback(
    (ids: string[], highQuality = false) => {
      const list = selectedViews(views, ids);
      if (list.length) void exportViews(list, "selected", highQuality);
    },
    [exportViews, views],
  );

  const exportAll = useCallback((highQuality = false) => {
    if (views.length) void exportViews([...views], "all", highQuality);
  }, [exportViews, views]);

  return { views, busy, warning, save, rename, remove, restore, exportSelected, exportAll };
}

