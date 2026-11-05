import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CityModel } from "../types";
import { DEFAULT_SITE_FRAME_SHAPE } from "../lib/siteFrame";
import { massingCutKey } from "../lib/massingStore";
import {
  MASSING_DEFAULT_WIDTH_M,
  MASSING_MIN_CENTERLINE_M,
  blockFootprintInsideCut,
  centerlineLengthM,
  createMassingBlock,
  distanceToCutBoundaryM,
  duplicateMassingBlock,
  footprintFromCenterline,
  snapDrawEnd,
  type MassingBlock,
  type MassingSnapContext,
} from "../lib/massingBlock";
import {
  readStoredMassingBlocks,
  writeStoredMassingBlocks,
  type MassingBlockStore,
} from "../lib/massingBlockStore";
import {
  INITIAL_MASSING_TOOL_STATE,
  massingToolIsDrawing,
  massingToolOrbitLocked,
  reduceMassingTool,
  type MassingToolState,
} from "../lib/massingToolMachine";

export type MassingToolApi = {
  cutId: string;
  blocks: MassingBlock[];
  tool: MassingToolState;
  orbitLocked: boolean;
  previewRing: ReturnType<typeof footprintFromCenterline> | null;
  previewMetrics: { widthM: number; lengthM: number; boundaryM: number } | null;
  setToolEnabled: (on: boolean) => void;
  dispatchTool: (event: Parameters<typeof reduceMassingTool>[1]) => void;
  commitDraw: () => MassingBlock | null;
  /** Centreline of the in-progress draw (start → snapped end), for the ground preview line. */
  draftCenterline: readonly [[number, number], [number, number]] | null;
  pointerDown: (east: number, north: number, hitBlockId: string | null) => void;
  pointerMove: (east: number, north: number) => void;
  pointerUp: () => void;
  updateSelected: (patch: Partial<Pick<MassingBlock, "width_m" | "floors" | "flipped">>) => void;
  deleteSelected: () => void;
  removeBlock: (id: string) => void;
  duplicateSelected: () => void;
  setBlocksForQa: (blocks: MassingBlock[]) => void;
  appendBlock: (block: MassingBlock) => void;
  snapContext: MassingSnapContext;
};

export function useMassingTool(model: Pick<CityModel, "center" | "sideM" | "frameShape">): MassingToolApi {
  const cutId = massingCutKey(model.center);
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const [store, setStore] = useState<MassingBlockStore>(() =>
    typeof window === "undefined" ? { v: 1, cutId, blocks: [] } : readStoredMassingBlocks(window.localStorage, cutId),
  );
  // Ref-mirrored reducer: canvas listeners fire pointerdown/up faster than React re-renders,
  // so gesture decisions (commit vs. enter preview) must read the latest state synchronously.
  const [tool, setTool] = useState<MassingToolState>(INITIAL_MASSING_TOOL_STATE);
  const toolRef = useRef<MassingToolState>(INITIAL_MASSING_TOOL_STATE);
  const dispatchToolRaw = useCallback((event: Parameters<typeof reduceMassingTool>[1]) => {
    const next = reduceMassingTool(toolRef.current, event);
    if (next === toolRef.current) return;
    toolRef.current = next;
    setTool(next);
  }, []);
  const blocksRef = useRef<MassingBlock[]>(store.blocks);
  blocksRef.current = store.blocks;

  useEffect(() => {
    const next = readStoredMassingBlocks(window.localStorage, cutId);
    setStore(next);
    dispatchToolRaw({ type: "DISABLE_TOOL" });
  }, [cutId, dispatchToolRaw]);

  const persist = useCallback(
    (blocks: MassingBlock[]) => {
      const next: MassingBlockStore = { v: 1, cutId, blocks };
      blocksRef.current = blocks;
      setStore(next);
      writeStoredMassingBlocks(window.localStorage, next);
    },
    [cutId],
  );

  const snapContext: MassingSnapContext = useMemo(
    () => ({
      sideM: model.sideM,
      frameShape,
      blocks: store.blocks,
      excludeBlockId: tool.selectedId ?? undefined,
    }),
    [frameShape, model.sideM, store.blocks, tool.selectedId],
  );

  const draftCenterline = useMemo(() => draftFrom(tool, snapContext), [snapContext, tool]);

  const previewRing = useMemo(() => {
    if (!draftCenterline) return null;
    if (centerlineLengthM(draftCenterline) < MASSING_MIN_CENTERLINE_M) return null;
    return footprintFromCenterline(draftCenterline, MASSING_DEFAULT_WIDTH_M, false);
  }, [draftCenterline]);

  const previewMetrics = useMemo(() => {
    if (!draftCenterline || !previewRing) return null;
    const boundaryM = Math.min(
      ...previewRing.slice(0, 4).map((p) => distanceBoundary(p, model.sideM, frameShape)),
    );
    return {
      widthM: MASSING_DEFAULT_WIDTH_M,
      lengthM: centerlineLengthM(draftCenterline),
      boundaryM,
    };
  }, [draftCenterline, frameShape, model.sideM, previewRing, snapContext, tool.drawEnd, tool.drawStart]);

  const dispatchTool = dispatchToolRaw;

  const setToolEnabled = useCallback((on: boolean) => {
    dispatchToolRaw(on ? { type: "ENABLE_TOOL" } : { type: "DISABLE_TOOL" });
  }, [dispatchToolRaw]);

  const commitDraw = useCallback((): MassingBlock | null => {
    const draft = draftFrom(toolRef.current, {
      sideM: model.sideM,
      frameShape,
      blocks: blocksRef.current,
      excludeBlockId: undefined,
    });
    if (!draft) return null;
    const draftCenterline = draft;
    const len = centerlineLengthM(draftCenterline);
    if (len < MASSING_MIN_CENTERLINE_M) return null;
    const block = createMassingBlock(cutId, draftCenterline);
    if (!blockFootprintInsideCut(block, model.sideM, frameShape)) return null;
    const blocks = [...blocksRef.current, block];
    persist(blocks);
    dispatchToolRaw({ type: "COMMIT_DRAW" });
    dispatchToolRaw({ type: "SELECT", id: block.id });
    return block;
  }, [cutId, dispatchToolRaw, frameShape, model.sideM, persist]);

  const pointerDown = useCallback(
    (east: number, north: number, hitBlockId: string | null) => {
      const wasPreview = toolRef.current.phase === "drawingPreview";
      dispatchToolRaw({ type: "POINTER_DOWN_GROUND", east, north, hitBlockId });
      // Second click commits; a too-short or out-of-cut line stays in preview.
      if (wasPreview) commitDraw();
    },
    [commitDraw, dispatchToolRaw],
  );

  const pointerMove = useCallback(
    (east: number, north: number) => dispatchToolRaw({ type: "POINTER_MOVE", east, north }),
    [dispatchToolRaw],
  );

  const pointerUp = useCallback(() => {
    if (toolRef.current.phase !== "drawing") return;
    // Dragged far enough → press-drag-release commit; otherwise this was a click → preview.
    if (!commitDraw()) dispatchToolRaw({ type: "POINTER_UP" });
  }, [commitDraw, dispatchToolRaw]);

  const updateSelected = useCallback(
    (patch: Partial<Pick<MassingBlock, "width_m" | "floors" | "flipped">>) => {
      if (!tool.selectedId) return;
      const blocks = store.blocks.map((item) => {
        if (item.id !== tool.selectedId) return item;
        const next = { ...item, ...patch };
        if (!blockFootprintInsideCut(next, model.sideM, frameShape)) return item;
        return next;
      });
      persist(blocks);
    },
    [frameShape, model.sideM, persist, store.blocks, tool.selectedId],
  );

  const removeBlock = useCallback(
    (id: string) => {
      setStore((prev) => {
        const blocks = prev.blocks.filter((item) => item.id !== id);
        const next: MassingBlockStore = { v: 1, cutId, blocks };
        writeStoredMassingBlocks(window.localStorage, next);
        return next;
      });
    },
    [cutId],
  );

  const deleteSelected = useCallback(() => {
    const id = tool.selectedId;
    if (!id) return;
    removeBlock(id);
    dispatchToolRaw({ type: "DELETE_SELECTED" });
  }, [dispatchToolRaw, removeBlock, tool.selectedId]);

  const duplicateSelected = useCallback(() => {
    const selected = store.blocks.find((item) => item.id === tool.selectedId);
    if (!selected) return;
    const copy = duplicateMassingBlock(selected, cutId);
    if (!blockFootprintInsideCut(copy, model.sideM, frameShape)) return;
    persist([...store.blocks, copy]);
    dispatchToolRaw({ type: "SELECT", id: copy.id });
  }, [dispatchToolRaw, cutId, frameShape, model.sideM, persist, store.blocks, tool.selectedId]);

  const setBlocksForQa = useCallback(
    (blocks: MassingBlock[]) => {
      persist(blocks);
    },
    [persist],
  );

  const appendBlock = useCallback(
    (block: MassingBlock) => {
      setStore((prev) => {
        const blocks = [...prev.blocks, block];
        const next: MassingBlockStore = { v: 1, cutId, blocks };
        writeStoredMassingBlocks(window.localStorage, next);
        return next;
      });
    },
    [cutId],
  );

  return {
    cutId,
    blocks: store.blocks,
    tool,
    orbitLocked: massingToolOrbitLocked(tool),
    previewRing,
    previewMetrics,
    setToolEnabled,
    dispatchTool,
    commitDraw,
    draftCenterline,
    pointerDown,
    pointerMove,
    pointerUp,
    updateSelected,
    deleteSelected,
    removeBlock,
    duplicateSelected,
    setBlocksForQa,
    appendBlock,
    snapContext,
  };
}

function distanceBoundary(point: [number, number], sideM: number, frameShape: typeof DEFAULT_SITE_FRAME_SHAPE): number {
  return distanceToCutBoundaryM(point, sideM, frameShape);
}

function draftFrom(
  tool: MassingToolState,
  snapContext: MassingSnapContext,
): readonly [[number, number], [number, number]] | null {
  if (!massingToolIsDrawing(tool) || !tool.drawStart || !tool.drawEnd) return null;
  const end = snapDrawEnd(tool.drawStart, tool.drawEnd, snapContext);
  return [tool.drawStart, end] as const;
}
