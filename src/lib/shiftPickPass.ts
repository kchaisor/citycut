export const SHIFT_PICK_CLASS = "is-shift-pick";

export function setShiftPickClass(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(SHIFT_PICK_CLASS, on);
}

export function attachShiftPickPass(): () => void {
  const onKey = (event: KeyboardEvent) => setShiftPickClass(event.shiftKey);
  const clear = () => setShiftPickClass(false);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("blur", clear);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    window.removeEventListener("blur", clear);
    clear();
  };
}
