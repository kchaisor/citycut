// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectChrome } from "./SelectChrome";
import { SEARCH_HISTORY_KEY } from "../lib/searchHistory";

const kew = { id: "k", label: "Kew", detail: "Victoria, Australia", lat: -37.8069, lon: 145.0347, bounds: null };

function renderChrome(onPlace = vi.fn()) {
  render(
    <SelectChrome
      center={{ lat: -37.8, lon: 145 }}
      basemap="map"
      onBasemap={() => undefined}
      placeLabel="Melbourne"
      sideKm={1}
      layers={{ buildings: true, roads: true, terrain: true, contours: true, waterGreen: true, trees: true, satellite: false } as never}
      loading={false}
      error={null}
      onSideKm={() => undefined}
      frameShape="square"
      onFrameShape={() => undefined}
      onLayer={() => undefined}
      onPlace={onPlace}
      onCreate={() => undefined}
      onHome={() => undefined}
    />,
  );
  return onPlace;
}

describe("recent searches", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);
  it("shows nothing when there is no history", () => {
    renderChrome();
    expect(screen.queryByRole("group", { name: "Recent searches" })).toBeNull();
  });
  it("lists stored places, reloads one on click, and clears", () => {
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify([kew]));
    const onPlace = renderChrome();
    fireEvent.click(screen.getByRole("button", { name: "Kew" }));
    expect(onPlace).toHaveBeenCalledWith(expect.objectContaining({ id: "k", lat: -37.8069, lon: 145.0347 }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByRole("group", { name: "Recent searches" })).toBeNull();
    expect(window.localStorage.getItem(SEARCH_HISTORY_KEY)).toBeNull();
  });
});
