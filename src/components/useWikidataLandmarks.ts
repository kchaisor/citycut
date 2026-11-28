import { useEffect, useMemo, useState } from "react";
import type { CityModel } from "../types";
import { cutBbox, landmarksFromLoad, wikidataItemsFor, type WikidataItemsLoad, type WikidataLandmarksState } from "../lib/wikidataLandmarks";

declare global {
  interface Window {
    __citycutWikidata?: { readonly status: WikidataLandmarksState["status"]; readonly matched: readonly string[] };
  }
}

export function useWikidataLandmarks(model: CityModel): WikidataLandmarksState {
  const on = model.layers.buildings;
  const bbox = useMemo(() => cutBbox(model), [model.center.lon, model.center.lat, model.sideM, model.widthM, model.heightM]);
  const key = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  const [load, setLoad] = useState<{ key: string; value: WikidataItemsLoad } | null>(null);

  useEffect(() => {
    if (!on) return;
    let live = true;
    void wikidataItemsFor(bbox).then((value) => {
      if (live) setLoad({ key, value });
    });
    return () => {
      live = false;
    };
  }, [on, key, bbox]);

  const state = useMemo((): WikidataLandmarksState => {
    if (!on) return { status: "idle" };
    if (!load || load.key !== key) return { status: "loading" };
    return landmarksFromLoad(model, load.value);
  }, [on, load, key, model]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__citycutWikidata = {
      status: state.status,
      matched: state.status === "ok" ? state.matches.map((m) => m.item.name) : [],
    };
  }, [state]);

  return state;
}
