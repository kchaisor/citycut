import { describe, expect, it } from "vitest";
import { initialSolarSettings } from "./initialSolarSettings";

const emptyStorage = { getItem: () => null, setItem: () => undefined };

describe("initialSolarSettings", () => {
  it("opens with Sun hours, Shadows and the heatmap off", () => {
    const settings = initialSolarSettings("", emptyStorage);
    expect(settings.sunHours).toBe(false);
    expect(settings.castShadows).toBe(false);
  });
});
