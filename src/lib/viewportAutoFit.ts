/** Skip a viewport-size refit when the user has moved the camera since the last snap id. */
export function shouldSkipViewportSizeRefit(
  fittedKey: string | null,
  nextKey: string,
  snapId: number,
  userTouched: boolean,
): boolean {
  if (fittedKey === nextKey) return true;
  const sameSnap = fittedKey?.startsWith(`${snapId}:`) ?? false;
  return sameSnap && userTouched;
}
