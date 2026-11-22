export function sunHoursLegendCardOn({
  tab,
  drawing,
  sunHours,
  hasResult,
  pending,
}: {
  tab: string;
  drawing: string;
  sunHours: boolean;
  hasResult: boolean;
  pending: boolean;
}): boolean {
  if (!sunHours || !(hasResult || pending)) return false;
  return tab === "3d" || (tab === "drawing" && drawing === "site");
}
