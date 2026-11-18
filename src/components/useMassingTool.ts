import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CityModel, Pt } from "../types";
import { DEFAULT_SITE_FRAME_SHAPE } from "../lib/siteFrame";
import { massingCutKey } from "../lib/massingStore";
import {
  MASSING_DEFAULT_WIDTH_M,
  MASSING_LOOP_CLOSE_M,
  MASSING_MIN_CENTERLINE_M,
  blockFootprintInsideCut,
  centerlineLengthM,
  createMassingBlock,
  distanceToCutBoundaryM,
  duplicateMassingBlock,
  footprintFromCenterline,
  snapDrawEnd,
  snapEndpoints,
  type MassingBlock,
  type MassingCenterline,
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

const MASSING_DOUBLE_CLICK_MS = 400;

export type MassingToolApi = {
  cutId: string;
  blocks: MassingBlock[];
  tool: MassingToolState;
  orbitLocked: boolean;
  previewRing: ReturnType<typeof footprintFromCenterline> | null;
  previewMetrics: { widthM: number; lengthM: number; boundaryM: number } | null;
  setToolEnabled: (on: boolean) => void;
  setDrawArmed: (on: boolean) => void;
  dispatchTool: (event: Parameters<typeof reduceMassingTool>[1]) => void;
  commitDraw: () => MassingBlock | null;
  finishDraw: () => MassingBlock | null;
  draftPolyline: readonly [number, number][] | null;
  pointerDown: (east: number, north: number, hitBlockId: string | null) => void;
  pointerMove: (east: number, north: number) => void;
  pointerUp: () => void;
  updateSelected: (patch: Partial<Pick<MassingBlock, "width_m" | "floors" | "flipped">>) => void;
  deleteSelected: () => void;
  removeBlock: (id: string) => void;
  duplicateSelected: () => void;
  setBlocksForQa: (blocks: MassingBlock[]) => void;
  appendBlock: (block: MassingBlock) => void;
  getToolPhase: () => MassingToolState["phase"];
  isDrawArmed: () => boolean;
  snapContext: MassingSnapContext;
};

export function useMassingTool(
  model: Pick<CityModel, "center" | "sideM" | "frameShape">,
  options?: { pointAllowed?: (east: number, north: number) => boolean },
): MassingToolApi {
  const pointAllowedRef = useRef(options?.pointAllowed ?? (() => true));
  pointAllowedRef.current = options?.pointAllowed ?? (() => true);
  const cutId = massingCutKey(model.center);
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const [store, setStore] = useState<MassingBlockStore>(() =>
    typeof window === "undefined" ? { v: 1, cutId, blocks: [] } : readStoredMassingBlocks(window.localStorage, cutId),
  );
  const [tool, setTool] = useState<MassingToolState>(INITIAL_MASSING_TOOL_STATE);
  const toolRef = useRef<MassingToolState>(INITIAL_MASSING_TOOL_STATE);
  const lastVertexClickMs = useRef(0);
  const lastVertexClickPt = useRef<[number, number] | null>(null);
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

  const snapContextRef = useRef(snapContext);
  snapContextRef.current = snapContext;

  const draftPolyline = useMemo(() => draftPolylineFrom(tool, snapContext), [snapContext, tool]);

  const previewRing = useMemo(() => {
    const line = draftCenterlineFromPolyline(draftPolyline);
    if (!line) return null;
    if (centerlineLengthM(line) < MASSING_MIN_CENTERLINE_M) return null;
    return footprintFromCenterline(line, MASSING_DEFAULT_WIDTH_M, false);
  }, [draftPolyline]);

  const previewMetrics = useMemo(() => {
    const line = draftCenterlineFromPolyline(draftPolyline);
    if (!line || !previewRing) return null;
    const boundaryM = Math.min(
      ...previewRing.slice(0, -1).map((p) => distanceBoundary(p, model.sideM, frameShape)),
    );
    return {
      widthM: MASSING_DEFAULT_WIDTH_M,
      lengthM: centerlineLengthM(line),
      boundaryM,
    };
  }, [draftPolyline, frameShape, model.sideM, previewRing]);

  const dispatchTool = dispatchToolRaw;

  const setToolEnabled = useCallback((on: boolean) => {
    dispatchToolRaw(on ? { type: "ENABLE_TOOL" } : { type: "DISABLE_TOOL" });
  }, [dispatchToolRaw]);

  const setDrawArmed = useCallback((on: boolean) => {
    dispatchToolRaw(on ? { type: "ARM_DRAW" } : { type: "DISARM_DRAW" });
  }, [dispatchToolRaw]);

  const buildDraftCenterline = useCallback((state: MassingToolState, ctx: MassingSnapContext): MassingCenterline | null => {
    if (!state.drawArmed || !massingToolIsDrawing(state) || !state.drawVertices?.length) return null;
    const verts = state.drawVertices;
  const first = snapEndpoints(verts[0]!, ctx);
    const snapped: Pt[] = [first];
    for (let i = 1; i < verts.length; i++) {
      snapped.push(snapDrawEnd(snapped[i - 1]!, verts[i]!, ctx));
    }
    if (state.phase === "drawing" && state.drawHover) {
      const end = snapDrawEnd(snapped[0]!, state.drawHover, ctx);
      return [snapped[0]!, end];
    }
    if (state.phase === "drawingPreview" && state.drawHover && snapped.length >= 1) {
      const hover = snapDrawEnd(snapped[snapped.length - 1]!, state.drawHover, ctx);
      return [...snapped, hover];
    }
    if (snapped.length < 2) return null;
    return snapped;
  }, []);

  const commitDraw = useCallback((): MassingBlock | null => {
    const state = toolRef.current;
    let centerline = buildDraftCenterline(state, {
      sideM: model.sideM,
      frameShape,
      blocks: blocksRef.current,
      excludeBlockId: undefined,
    });
    if (state.phase === "drawingPreview" && state.drawVertices && state.drawVertices.length >= 2) {
      const ctx = snapContextRef.current;
      const first = snapEndpoints(state.drawVertices[0]!, ctx);
      const snapped: Pt[] = [first];
      for (let i = 1; i < state.drawVertices.length; i++) {
        snapped.push(snapDrawEnd(snapped[i - 1]!, state.drawVertices[i]!, ctx));
      }
      centerline = snapped;
    }
    if (!centerline || centerline.length < 2) return null;
    const len = centerlineLengthM(centerline);
    if (len < MASSING_MIN_CENTERLINE_M) return null;
    for (const pt of centerline) {
      if (!pointAllowedRef.current(pt[0], pt[1])) return null;
    }
    const block = createMassingBlock(cutId, centerline);
    if (!blockFootprintInsideCut(block, model.sideM, frameShape)) return null;
    const blocks = [...blocksRef.current, block];
    persist(blocks);
    dispatchToolRaw({ type: "COMMIT_DRAW" });
    dispatchToolRaw({ type: "SELECT", id: block.id });
    return block;
  }, [buildDraftCenterline, cutId, dispatchToolRaw, frameShape, model.sideM, persist]);

  const finishDraw = useCallback((): MassingBlock | null => {
    return commitDraw();
  }, [commitDraw]);

  const pointerDown = useCallback(
    (east: number, north: number, hitBlockId: string | null) => {
      const current = toolRef.current;
      if (!current.toolEnabled) return;
      if (
        !hitBlockId &&
        current.drawArmed &&
        !pointAllowedRef.current(east, north) &&
        (current.phase === "idle" ||
          current.phase === "selected" ||
          current.phase === "drawingPreview" ||
          current.phase === "drawing")
      ) {
        return;
      }
      if (current.drawArmed && current.phase === "drawingPreview" && !hitBlockId && current.drawVertices?.length) {
        const now = performance.now();
        const first = current.drawVertices[0]!;
        const nearFirst =
          current.drawVertices.length >= 2 &&
          Math.hypot(east - first[0], north - first[1]) <= MASSING_LOOP_CLOSE_M;
        if (nearFirst) {
          commitDraw();
          lastVertexClickMs.current = now;
          return;
        }
        if (
          now - lastVertexClickMs.current <= MASSING_DOUBLE_CLICK_MS &&
          current.drawVertices.length >= 2 &&
          lastVertexClickPt.current &&
          Math.hypot(east - lastVertexClickPt.current[0], north - lastVertexClickPt.current[1]) <= 1.5
        ) {
          commitDraw();
          lastVertexClickMs.current = now;
          lastVertexClickPt.current = [east, north];
          return;
        }
        const last = current.drawVertices[current.drawVertices.length - 1]!;
        const snapped = snapDrawEnd(last, [east, north], snapContextRef.current);
        dispatchToolRaw({ type: "ADD_VERTEX", east: snapped[0], north: snapped[1] });
        lastVertexClickMs.current = now;
        lastVertexClickPt.current = [snapped[0], snapped[1]];
        return;
      }
      dispatchToolRaw({ type: "POINTER_DOWN_GROUND", east, north, hitBlockId });
      lastVertexClickMs.current = performance.now();
      lastVertexClickPt.current = [east, north];
    },
    [commitDraw, dispatchToolRaw],
  );

  const pointerMove = useCallback(
    (east: number, north: number) => {
      const current = toolRef.current;
      if (
        (current.phase === "drawing" || current.phase === "drawingPreview") &&
        current.drawArmed &&
        !pointAllowedRef.current(east, north)
      ) {
        return;
      }
      dispatchToolRaw({ type: "POINTER_MOVE", east, north });
    },
    [dispatchToolRaw],
  );

  const pointerUp = useCallback(() => {
    const current = toolRef.current;
    if (current.phase !== "drawing" || !current.drawArmed) return;
    const ctx = snapContextRef.current;
    const draft = buildDraftCenterline(current, ctx);
    if (draft && centerlineLengthM(draft) >= MASSING_MIN_CENTERLINE_M) {
      commitDraw();
      return;
    }
    dispatchToolRaw({ type: "POINTER_UP" });
  }, [buildDraftCenterline, commitDraw, dispatchToolRaw]);

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

  const getToolPhase = useCallback(() => toolRef.current.phase, []);
  const isDrawArmed = useCallback(() => toolRef.current.drawArmed, []);

  return {
    cutId,
    blocks: store.blocks,
    tool,
    orbitLocked: massingToolOrbitLocked(tool),
    previewRing,
    previewMetrics,
    setToolEnabled,
    setDrawArmed,
    dispatchTool,
    commitDraw,
    finishDraw,
    draftPolyline,
    pointerDown,
    pointerMove,
    pointerUp,
    updateSelected,
    deleteSelected,
    removeBlock,
    duplicateSelected,
    setBlocksForQa,
    appendBlock,
    getToolPhase,
    isDrawArmed,
    snapContext,
  };
}

function distanceBoundary(point: [number, number], sideM: number, frameShape: typeof DEFAULT_SITE_FRAME_SHAPE): number {
  return distanceToCutBoundaryM(point, sideM, frameShape);
}

function draftPolylineFrom(tool: MassingToolState, snapContext: MassingSnapContext): readonly [number, number][] | null {
  if (!tool.drawArmed || !massingToolIsDrawing(tool) || !tool.drawVertices?.length) return null;
  const verts = tool.drawVertices;
  const first = snapEndpoints(verts[0]!, snapContext);
  const fixed: [number, number][] = [first];
  for (let i = 1; i < verts.length; i++) {
    const snapped = snapDrawEnd(fixed[i - 1]!, verts[i]!, snapContext);
    fixed.push(snapped);
  }
  if (tool.drawHover) {
    const from = tool.phase === "drawing" && fixed.length === 1 ? fixed[0]! : fixed[fixed.length - 1]!;
    const hover =
      tool.phase === "drawing" && fixed.length === 1
        ? snapDrawEnd(fixed[0]!, tool.drawHover, snapContext)
        : snapDrawEnd(from, tool.drawHover, snapContext);
    return [...fixed, hover];
  }
  return fixed.length >= 2 ? fixed : fixed;
}

function draftCenterlineFromPolyline(polyline: readonly [number, number][] | null): MassingCenterline | null {
  if (!polyline || polyline.length < 2) return null;
  return polyline as MassingCenterline;
}
