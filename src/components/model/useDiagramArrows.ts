import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CityModel } from "../../types";
import {
  arrowsForCut,
  readDiagramArrowsStore,
  withCutArrows,
  writeDiagramArrowsStore,
  type DiagramArrow,
} from "../../lib/diagramArrows";
import { arrowToolKeyAction, arrowToolReducer, initialArrowToolState } from "../../lib/diagramArrowsTool";
import { modelCutSiteId } from "../../lib/introPlayed";
import type { NamedViewArrows } from "../../lib/namedViews";
import type { ArrowScreenLabel } from "../DiagramArrows3D";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function useDiagramArrows(model: Pick<CityModel, "center" | "sideM">) {
  const cutId = modelCutSiteId(model.center, model.sideM);
  const [state, dispatch] = useReducer(arrowToolReducer, cutId, (id) =>
    initialArrowToolState(arrowsForCut(readDiagramArrowsStore(window.localStorage), id)),
  );
  const [labels, setLabels] = useState<ArrowScreenLabel[]>([]);
  const loadedCut = useRef(cutId);

  useEffect(() => {
    if (loadedCut.current === cutId) return;
    loadedCut.current = cutId;
    dispatch({ type: "replace", arrows: arrowsForCut(readDiagramArrowsStore(window.localStorage), cutId) });
  }, [cutId]);

  useEffect(() => {
    if (loadedCut.current !== cutId) return;
    const store = readDiagramArrowsStore(window.localStorage);
    writeDiagramArrowsStore(window.localStorage, withCutArrows(store, cutId, state.arrows));
  }, [cutId, state.arrows]);

  useEffect(() => {
    if (!state.active) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const action = arrowToolKeyAction(state, event.key);
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const snapshot = useCallback((): NamedViewArrows => ({ visible: state.visible, items: state.arrows }), [state.visible, state.arrows]);
  const restore = useCallback((saved: NamedViewArrows | null) => {
    if (saved) dispatch({ type: "replace", arrows: saved.items as DiagramArrow[], visible: saved.visible });
  }, []);

  return { state, dispatch, labels, setLabels, snapshot, restore };
}
