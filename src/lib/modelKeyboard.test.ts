// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { handleModelKeyDown } from "./modelKeyboard";

const base = {
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  target: null as EventTarget | null,
  commandBarOpen: false,
  cheatsheetOpen: false,
};

describe("handleModelKeyDown", () => {
  it("opens the cheatsheet on ?", () => {
    expect(handleModelKeyDown({ ...base, key: "?" }).type).toBe("open-cheatsheet");
  });

  it("maps S to Sun", () => {
    const result = handleModelKeyDown({ ...base, key: "s" });
    expect(result).toEqual({
      type: "shortcut",
      action: { section: "analysis", analysisKind: "solar" },
    });
  });

  it("ignores shortcuts while typing in an input", () => {
    const input = document.createElement("input");
    expect(handleModelKeyDown({ ...base, key: "s", target: input }).type).toBe("none");
  });

  it("ignores letter shortcuts when the command bar is open", () => {
    expect(handleModelKeyDown({ ...base, key: "s", commandBarOpen: true }).type).toBe("none");
  });

  it("does not handle X when section cut is unavailable", () => {
    expect(handleModelKeyDown({ ...base, key: "x" }).type).toBe("none");
  });

  it("ignores shortcuts with modifiers", () => {
    expect(handleModelKeyDown({ ...base, key: "s", metaKey: true }).type).toBe("none");
  });
});
