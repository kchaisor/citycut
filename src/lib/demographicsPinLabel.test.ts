import { describe, expect, it } from "vitest";
import { qaSuburbLabelAt } from "./demographicsPinLabel";

describe("qaSuburbLabelAt", () => {
  it("labels Fitzroy and Carlton seed coordinates", () => {
    expect(qaSuburbLabelAt(144.9778, -37.8032)).toBe("Fitzroy");
    expect(qaSuburbLabelAt(144.9705, -37.8045)).toBe("Carlton");
  });

  it("labels Melbourne CBD coordinates", () => {
    expect(qaSuburbLabelAt(144.963, -37.813)).toBe("Melbourne");
  });
});
