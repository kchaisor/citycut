// @vitest-environment happy-dom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "./AppRoot";
import type { PlaceHit } from "./types";

const rozelle: PlaceHit = {
  id: "rozelle",
  label: "Rozelle NSW",
  detail: "NSW",
  lat: -33.86721,
  lon: 151.18163,
  bounds: null,
};

const { stageProps, goToPlaceRef } = vi.hoisted(() => ({
  stageProps: [] as Record<string, unknown>[],
  goToPlaceRef: { current: null as ((place: PlaceHit, sideKm: number | null) => void) | null },
}));

vi.mock("./components/MapStage", () => ({
  MapStage: (props: Record<string, unknown>) => {
    stageProps.push(props);
    return <div className="map-wrap" data-testid="map" />;
  },
}));

vi.mock("./components/CommandBar", () => ({
  CommandBar: ({ onGoToPlace }: { onGoToPlace: (place: PlaceHit, sideKm: number | null) => void }) => {
    goToPlaceRef.current = onGoToPlace;
    return null;
  },
}));

vi.mock("./components/ModelPage", () => ({ ModelPage: () => <div className="model" /> }));

beforeEach(() => {
  window.history.replaceState({}, "", "/citycut/");
  window.localStorage.clear();
  stageProps.length = 0;
  goToPlaceRef.current = null;
});

afterEach(() => cleanup());

describe("command bar cut size", () => {
  it("applies a side-km override to the cut spec passed to MapStage", async () => {
    render(<AppRoot />);
    expect(goToPlaceRef.current).toBeTruthy();
    goToPlaceRef.current!(rozelle, 2);
    await waitFor(() => {
      const last = stageProps.at(-1);
      expect(last?.sideM).toBe(2000);
      expect(last?.widthM).toBe(2000);
      expect(last?.heightM).toBe(2000);
    });
  });
});
