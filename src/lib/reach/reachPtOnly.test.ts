import { describe, expect, it } from "vitest";
import { REACH_UNREACHABLE } from "./constants";
import { classifyPtOnly } from "./computeReach";

describe("classifyPtOnly", () => {
  it("marks violet cells only when walk exceeds the active budget but PT does not", () => {
    const walkMin = new Uint8Array([0, 8, 20, REACH_UNREACHABLE]);
    const combinedMin = new Uint8Array([0, 6, 12, 10]);
    const ptOnly = classifyPtOnly(walkMin, combinedMin, 15);
    expect(ptOnly[0]).toBe(false);
    expect(ptOnly[1]).toBe(false);
    expect(ptOnly[2]).toBe(true);
    expect(ptOnly[3]).toBe(true);
  });
});
