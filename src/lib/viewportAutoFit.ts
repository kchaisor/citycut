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
