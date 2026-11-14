export function loadingPillOverlapsHudCard(
  pill: Pick<DOMRectReadOnly, "top" | "bottom" | "left" | "right">,
  card: Pick<DOMRectReadOnly, "top" | "bottom" | "left" | "right">,
  gapPx = 8,
): boolean {
  if (pill.right <= pill.left || pill.bottom <= pill.top) return false;
  if (card.right <= card.left || card.bottom <= card.top) return false;
  if (pill.top >= card.bottom + gapPx) return false;
  return !(pill.right < card.left || pill.left > card.right || pill.bottom < card.top || pill.top > card.bottom);
}
