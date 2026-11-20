import { describe, expect, it } from "vitest";
import { introAlreadyPlayedForCut, markIntroPlayedForCut, modelCutSiteId } from "./introPlayed";

describe("intro played marker", () => {
  const center = { lat: -37.8127, lon: 144.98061 };
  const sideM = 500;

  it("keys cut/site identity to centre and side length", () => {
    expect(modelCutSiteId(center, sideM)).toBe("-37.81270,144.98061,500");
    expect(modelCutSiteId({ lat: -37.81271, lon: 144.98061 }, sideM)).not.toBe(modelCutSiteId(center, sideM));
    expect(modelCutSiteId(center, 600)).not.toBe(modelCutSiteId(center, sideM));
  });

  it("plays intro only until the marker matches the current cut", () => {
    const store = { current: null as string | null };
    const cutId = modelCutSiteId(center, sideM);
    expect(introAlreadyPlayedForCut(store.current, cutId)).toBe(false);
    markIntroPlayedForCut(store, cutId);
    expect(introAlreadyPlayedForCut(store.current, cutId)).toBe(true);
    expect(introAlreadyPlayedForCut(store.current, modelCutSiteId(center, 600))).toBe(false);
  });
});
