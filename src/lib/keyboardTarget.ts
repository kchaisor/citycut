export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  const el = target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
  return el !== null;
}
