// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { SHIFT_PICK_CLASS, attachShiftPickPass, setShiftPickClass } from "./shiftPickPass";

afterEach(() => {
  document.documentElement.classList.remove(SHIFT_PICK_CLASS);
});

describe("attachShiftPickPass", () => {
  it("turns on a document class while Shift is held so the inspect card can pass clicks through", () => {
    const detach = attachShiftPickPass();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", shiftKey: false }));
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(false);
    setShiftPickClass(true);
    detach();
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(false);
  });
});
