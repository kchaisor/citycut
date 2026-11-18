import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createMassingBlock } from "../../lib/massingBlock";
import { readStoredMassingBlocks } from "../../lib/massingBlockStore";
import { qaModeFromSearch } from "../../lib/qaCameraBridge";
import { SURFACE } from "../../lib/surfaceLayers";
import { sampleTerrain } from "../../lib/terrain";
import type { CityModel } from "../../types";
import { useMassingParcels } from "../useMassingParcels";
import { useMassingTool } from "../useMassingTool";
import type { Tab } from "./modelPageConstants";

export function useModelPageMassing(model: CityModel, tab: Tab) {
  const massingPointAllowedRef = useRef<(east: number, north: number) => boolean>(() => true);
  const massingDraw = useMassingTool(model, {
    pointAllowed: (east, north) => massingPointAllowedRef.current(east, north),
  });
  const massingParcels = useMassingParcels(model, massingDraw.tool.toolEnabled);
  massingPointAllowedRef.current = massingParcels.pointAllowed;
  const [massingCursor, setMassingCursor] = useState({ x: 0, y: 0 });
  const massingHeightDragFloors = useRef<number>(4);
  const massingSceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedMassingBlock = useMemo(
    () => massingDraw.blocks.find((item) => item.id === massingDraw.tool.selectedId) ?? null,
    [massingDraw.blocks, massingDraw.tool.selectedId],
  );

  useEffect(() => {
    const canvas = massingSceneCanvasRef.current;
    if (!canvas) return;
    const titleSelect = massingDraw.tool.toolEnabled && !massingDraw.tool.drawArmed;
    canvas.style.cursor = titleSelect && massingParcels.hoveredParcelId != null ? "pointer" : "";
  }, [massingDraw.tool.drawArmed, massingDraw.tool.toolEnabled, massingParcels.hoveredParcelId]);

  const massingGroundPointerMove = useCallback(
    (
      east: number | null,
      north: number | null,
      _clientX: number,
      _clientY: number,
      hitBlockId: string | null,
    ) => {
      if (!massingDraw.tool.toolEnabled || massingDraw.tool.drawArmed) {
        massingParcels.setHoveredParcelId(null);
        return;
      }
      if (hitBlockId) {
        massingParcels.setHoveredParcelId(null);
        return;
      }
      if (east == null || north == null) {
        massingParcels.setHoveredParcelId(null);
        return;
      }
      massingParcels.setHoveredParcelId(massingParcels.pickAt(east, north));
    },
    [massingDraw.tool.drawArmed, massingDraw.tool.toolEnabled, massingParcels],
  );

  useEffect(() => {
    if (tab !== "3d") {
      massingDraw.dispatchTool({ type: "LEAVE_3D_VIEW" });
    }
  }, [tab, massingDraw.dispatchTool]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      (!qaModeFromSearch(window.location.search) && !(window as Window & { __citycutVerifyHarness?: boolean }).__citycutVerifyHarness)
    ) {
      return;
    }
    window.__citycutQaMassing = {
      enableTool: () => massingDraw.setToolEnabled(true),
      disableTool: () => massingDraw.setToolEnabled(false),
      armDraw: () => massingDraw.setDrawArmed(true),
      disarmDraw: () => massingDraw.setDrawArmed(false),
      qaFocusParcelHover: (parcelId: string) => {
        const c = massingParcels.samplePointForParcel(parcelId);
        if (!c) return false;
        const [east, north] = c;
        const groundY = model.terrain ? sampleTerrain(model.terrain, east, north, model.sideM) : 0;
        const y = groundY + SURFACE.rail.lift + 0.35;
        const z = -north;
        const p = window.__citycutQa?.projectToScreen({ x: east, y, z });
        if (!p) return false;
        const canvas = document.querySelector<HTMLCanvasElement>(".model canvas");
        if (!canvas) return false;
        canvas.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: p.x,
            clientY: p.y,
            pointerId: 1,
            buttons: 0,
            pointerType: "mouse",
          }),
        );
        return true;
      },
      selectParcels: (ids: string[]) => massingParcels.selectParcels(ids),
      clearParcels: () => massingParcels.clearSelection(),
      nearestParcelIds: (count: number) => massingParcels.nearestIds(count),
      getParcelState: () => massingParcels.getSyncState(),
      sampleInsideBoundary: () => massingParcels.sampleInsideBoundary(),
      pointInSiteBoundary: (east: number, north: number) => massingParcels.pointAllowed(east, north),
      qaGroundPress: (east: number, north: number) => massingDraw.pointerDown(east, north, null),
      qaGroundRelease: () => massingDraw.pointerUp(),
      qaGroundMove: (east: number, north: number) => massingDraw.pointerMove(east, north),
      finishDraw: () => massingDraw.finishDraw(),
      commitPolylineCenterline: (
        points: [number, number][],
        partial?: Parameters<typeof createMassingBlock>[2],
      ) => {
        if (points.length < 2) return null;
        const block = createMassingBlock(massingDraw.cutId, points, partial);
        massingDraw.appendBlock(block);
        massingDraw.dispatchTool({ type: "SELECT", id: block.id });
        return block.id;
      },
      clearDrawnBlocks: () => massingDraw.setBlocksForQa([]),
      getToolPhase: () => massingDraw.getToolPhase(),
      drawArmed: () => massingDraw.isDrawArmed(),
      simulateDraw: (east0: number, north0: number, east1: number, north1: number) => {
        massingDraw.setToolEnabled(true);
        const block = createMassingBlock(massingDraw.cutId, [
          [east0, north0],
          [east1, north1],
        ]);
        const stored = readStoredMassingBlocks(window.localStorage, massingDraw.cutId);
        massingDraw.setBlocksForQa([...stored.blocks, block]);
        massingDraw.dispatchTool({ type: "SELECT", id: block.id });
        return block.id;
      },
      getBlocks: () => readStoredMassingBlocks(window.localStorage, massingDraw.cutId).blocks,
      selectBlock: (id: string) => {
        massingDraw.setToolEnabled(true);
        massingDraw.dispatchTool({ type: "SELECT", id });
      },
      setFloors: (floors: number) => {
        const stored = readStoredMassingBlocks(window.localStorage, massingDraw.cutId);
        const id = stored.blocks[0]?.id;
        if (!id) return;
        massingDraw.dispatchTool({ type: "SELECT", id });
        massingDraw.updateSelected({ floors });
      },
      deleteSelected: () => {
        const stored = readStoredMassingBlocks(window.localStorage, massingDraw.cutId);
        const id = stored.blocks[0]?.id;
        if (id) massingDraw.removeBlock(id);
        massingDraw.dispatchTool({ type: "DELETE_SELECTED" });
      },
      readPersistedCount: () => {
        const key = `citycut.massingBlocks.${massingDraw.cutId}`;
        try {
          const raw = window.localStorage.getItem(key);
          if (!raw) return 0;
          const data = JSON.parse(raw) as { blocks?: unknown[] };
          return Array.isArray(data.blocks) ? data.blocks.length : 0;
        } catch {
          return 0;
        }
      },
    };
    return () => {
      delete window.__citycutQaMassing;
    };
  }, [
    massingDraw.appendBlock,
    massingDraw.finishDraw,
    massingDraw.cutId,
    massingDraw.dispatchTool,
    massingDraw.removeBlock,
    massingDraw.setBlocksForQa,
    massingDraw.setDrawArmed,
    massingDraw.setToolEnabled,
    massingDraw.updateSelected,
    massingParcels.boundary.length,
    massingParcels.samplePointForParcel,
    massingParcels.clearSelection,
    massingParcels.nearestIds,
    massingParcels.selectParcels,
    massingParcels.selectedIds,
    model.center,
    model.sideM,
    model.terrain,
  ]);

  return {
    massingCursor,
    massingDraw,
    massingGroundPointerMove,
    massingHeightDragFloors,
    massingParcels,
    massingSceneCanvasRef,
    selectedMassingBlock,
    setMassingCursor,
  };
}
