import { describe, expect, it } from "vitest";
import { nextHideSelection } from "./hideSelection";

describe("nextHideSelection", () => {
  it("starts the selection with the first clicked building", () => {
    expect(nextHideSelection([], 7, false)).toEqual([7]);
  });

  it("adds a second building on Shift-click", () => {
    const first = nextHideSelection([], 7, false);
    expect(nextHideSelection(first, 9, true)).toEqual([7, 9]);
  });

  it("removes a building when it is Shift-clicked again", () => {
    expect(nextHideSelection([7, 9], 9, true)).toEqual([7]);
  });

  it("replaces the whole selection on a click without Shift", () => {
    expect(nextHideSelection([7, 9, 11], 4, false)).toEqual([4]);
    expect(nextHideSelection([7, 9], 9, false)).toEqual([9]);
  });

  it("starts a selection when the first click already holds Shift", () => {
    expect(nextHideSelection([], 7, true)).toEqual([7]);
  });
});
