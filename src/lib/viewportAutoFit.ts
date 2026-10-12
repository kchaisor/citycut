/**
 * Skip a viewport-size refit once the camera has been fitted for this snap id.
 *
 * A resize (window, or the sidebar collapsing) keeps the camera, zoom and target as
 * they are, whether or not the user has moved the camera. Only a new snap or fit id
 * (a projection, corner or Fit request) places the camera again. `userTouched` is kept
 * for callers that still pass it; it no longer changes the answer.
 */
export function shouldSkipViewportSizeRefit(
  fittedKey: string | null,
  nextKey: string,
  snapId: number,
  userTouched = false,
): boolean {
  void userTouched;
  if (fittedKey === nextKey) return true;
  return fittedKey?.startsWith(`${snapId}:`) ?? false;
}
