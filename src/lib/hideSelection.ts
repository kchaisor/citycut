export function nextHideSelection(prev: number[], buildingId: number, additive: boolean): number[] {
  if (!additive) return [buildingId];
  return prev.includes(buildingId) ? prev.filter((id) => id !== buildingId) : [...prev, buildingId];
}
