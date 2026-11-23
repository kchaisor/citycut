export const SHIFT_PICK_CLASS = "is-shift-pick";
export const SHIFT_PICK_CARD_SELECTOR = ".building-detail-panel.is-floating, .building-detail-panel.inspect-hud";
export const SHIFT_PICK_CONTROL_SELECTOR = "button, input, select, a";

export function setShiftPickClass(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(SHIFT_PICK_CLASS, on);
}

function cardSurfaceUnder(event: MouseEvent): Element | null {
  if (!event.shiftKey || event.button !== 0) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const card = target.closest(SHIFT_PICK_CARD_SELECTOR);
  if (!card || target.closest(SHIFT_PICK_CONTROL_SELECTOR)) return null;
  return card;
}

export function canvasUnderCard(card: Element, clientX: number, clientY: number): HTMLCanvasElement | null {
  if (typeof document.elementsFromPoint !== "function") return null;
  const below = document.elementsFromPoint(clientX, clientY).find((element) => !card.contains(element));
  return below instanceof HTMLCanvasElement ? below : null;
}

function retargetToCanvas(event: MouseEvent): void {
  const card = cardSurfaceUnder(event);
  if (!card) return;
  const canvas = canvasUnderCard(card, event.clientX, event.clientY);
  if (!canvas) return;
  event.preventDefault();
  event.stopPropagation();
  const pointer = event as Partial<PointerEvent>;
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: event.view,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: event.button,
    buttons: event.buttons,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    pointerId: pointer.pointerId,
    pointerType: pointer.pointerType,
    isPrimary: pointer.isPrimary,
  };
  const Ctor = event.constructor as typeof PointerEvent;
  canvas.dispatchEvent(new Ctor(event.type, init));
}

function keepFocusOnCardPick(event: MouseEvent): void {
  if (cardSurfaceUnder(event)) event.preventDefault();
}

export function attachShiftPickPass(): () => void {
  const onModifier = (event: KeyboardEvent | PointerEvent) => setShiftPickClass(event.shiftKey);
  const onPress = (event: PointerEvent) => {
    setShiftPickClass(event.shiftKey);
    retargetToCanvas(event);
  };
  const clear = () => setShiftPickClass(false);
  window.addEventListener("keydown", onModifier, true);
  window.addEventListener("keyup", onModifier, true);
  window.addEventListener("pointermove", onModifier, true);
  window.addEventListener("pointerdown", onPress, true);
  window.addEventListener("pointerup", retargetToCanvas, true);
  window.addEventListener("mousedown", keepFocusOnCardPick, true);
  window.addEventListener("blur", clear);
  return () => {
    window.removeEventListener("keydown", onModifier, true);
    window.removeEventListener("keyup", onModifier, true);
    window.removeEventListener("pointermove", onModifier, true);
    window.removeEventListener("pointerdown", onPress, true);
    window.removeEventListener("pointerup", retargetToCanvas, true);
    window.removeEventListener("mousedown", keepFocusOnCardPick, true);
    window.removeEventListener("blur", clear);
    clear();
  };
}
