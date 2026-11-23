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

  it("sees Shift in the capture phase even when a focused field stops the key from bubbling", () => {
    const detach = attachShiftPickPass();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.addEventListener("keydown", (event) => event.stopPropagation());
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, bubbles: true }));
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(true);
    detach();
    input.remove();
  });

  it("follows shiftKey on pointer events when no key event arrived", () => {
    const detach = attachShiftPickPass();
    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, shiftKey: true }));
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(true);
    document.body.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, shiftKey: false }));
    expect(document.documentElement.classList.contains(SHIFT_PICK_CLASS)).toBe(false);
    detach();
  });
});
