export const SHIFT_PICK_CLASS = "is-shift-pick";
export const SHIFT_PICK_CARD_SELECTOR = ".building-detail-panel.is-floating, .building-detail-panel.inspect-hud";
export function setShiftPickClass(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(SHIFT_PICK_CLASS, on);
}

export const CARD_CONTROL_SELECTOR = "button, input, select, textarea, a, label";

const passedThroughCard = new WeakSet<Event>();

export function isCardPassThrough(event: Event): boolean {
  return passedThroughCard.has(event);
}

const OVERLAY_SCROLLBAR_PX = 14;

function onScrollbar(target: Element, event: MouseEvent): boolean {
  if (!(target instanceof HTMLElement) || target.scrollHeight <= target.clientHeight) return false;
  const rect = target.getBoundingClientRect();
  const gutter = Math.max(target.offsetWidth - target.clientWidth - target.clientLeft * 2, OVERLAY_SCROLLBAR_PX);
  return event.clientX >= rect.right - target.clientLeft - gutter;
}

function cardSurfaceUnder(event: MouseEvent): Element | null {
  if (event.button !== 0) return null;
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const card = target.closest(SHIFT_PICK_CARD_SELECTOR);
  if (!card || event.shiftKey) return card;
  if (target.closest(CARD_CONTROL_SELECTOR) || onScrollbar(target, event)) return null;
  return card;
}

export function canvasUnderCard(card: Element, clientX: number, clientY: number): HTMLCanvasElement | null {
  if (typeof document.elementsFromPoint !== "function") return null;
  const hits = document.elementsFromPoint(clientX, clientY).filter(
    (element): element is HTMLCanvasElement => element instanceof HTMLCanvasElement && !card.contains(element),
  );
  return hits.find((canvas) => canvas.closest(".model") && !canvas.closest(".is-parked")) ?? hits[0] ?? null;
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
  const passed = new Ctor(event.type, init);
  passedThroughCard.add(passed);
  canvas.dispatchEvent(passed);
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
