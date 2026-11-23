// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  SHIFT_PICK_CLASS,
  attachShiftPickPass,
  canvasUnderCard,
  isCardPassThrough,
  setShiftPickClass,
} from "./shiftPickPass";

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

  it("finds the 3D canvas even when another overlay sits between the card and the canvas", () => {
    const card = document.createElement("aside");
    const overlay = document.createElement("div");
    const canvas = document.createElement("canvas");
    const model = document.createElement("div");
    model.className = "model";
    model.append(canvas);
    document.body.append(card, overlay, model);
    document.elementsFromPoint = () => [card, overlay, model, canvas];
    expect(canvasUnderCard(card, 40, 40)).toBe(canvas);
    card.remove();
    overlay.remove();
    model.remove();
  });

  it("passes a plain press on the card surface to the canvas but leaves the scrollbar alone", () => {
    const detach = attachShiftPickPass();
    const card = document.createElement("aside");
    card.className = "building-detail-panel is-floating inspect-hud";
    const body = document.createElement("div");
    card.append(body);
    const model = document.createElement("div");
    model.className = "model";
    const canvas = document.createElement("canvas");
    model.append(canvas);
    document.body.append(card, model);
    document.elementsFromPoint = () => [body, card, canvas];
    Object.defineProperty(body, "scrollHeight", { value: 900 });
    Object.defineProperty(body, "clientHeight", { value: 400 });
    body.getBoundingClientRect = () => ({ left: 800, top: 100, right: 1080, bottom: 500, width: 280, height: 400 }) as DOMRect;
    const seen: { x: number; shift: boolean; passed: boolean }[] = [];
    canvas.addEventListener("pointerdown", (event) =>
      seen.push({ x: event.clientX, shift: event.shiftKey, passed: isCardPassThrough(event) }),
    );
    const down = (clientX: number, shiftKey = false) =>
      body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, clientX, clientY: 200, shiftKey }));
    down(900);
    down(1074);
    down(900, true);
    expect(seen).toEqual([
      { x: 900, shift: false, passed: true },
      { x: 900, shift: true, passed: true },
    ]);
    detach();
    card.remove();
    model.remove();
  });
});
