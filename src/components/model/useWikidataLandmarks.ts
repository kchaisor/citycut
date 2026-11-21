import { useEffect, useMemo, useState } from "react";
import {
  cutBox,
  loadWikidataForCut,
  matchWikidataLandmarks,
  wikidataStatus,
  type WikidataCutItems,
  type WikidataMatchResult,
  type WikidataStatus,
} from "../../lib/wikidataLandmarks";
import type { CityModel } from "../../types";

const EMPTY_RESULT: WikidataMatchResult = { matches: [], noFootprint: [], ambiguous: [] };

export function useWikidataLandmarks(model: CityModel): { status: WikidataStatus; result: WikidataMatchResult } {
  const { center, sideM, widthM, heightM } = model;
  const enabled = model.layers.buildings;
  const [items, setItems] = useState<{ key: string; value: WikidataCutItems } | null>(null);
  const key = `${center.lat},${center.lon},${sideM},${widthM ?? ""},${heightM ?? ""}`;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadWikidataForCut(cutBox({ center, sideM, widthM, heightM })).then((value) => {
      if (!cancelled) setItems({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  const current = items?.key === key ? items.value : null;
  const result = useMemo(
    () => (current?.ok ? matchWikidataLandmarks(current.items, model.buildings, center) : EMPTY_RESULT),
    [current, model.buildings, center],
  );
  const status: WikidataStatus = !enabled
    ? { state: "idle" }
    : current === null
      ? { state: "loading" }
      : wikidataStatus(current, result);
  return { status, result };
}
