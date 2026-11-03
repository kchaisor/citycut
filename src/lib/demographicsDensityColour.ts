import { getColour } from "./colours";
import { densityRampStops } from "./demographicsParcels";

const DENSITY_VAR_KEYS = [
  "--demographics-density-0",
  "--demographics-density-1",
  "--demographics-density-2",
  "--demographics-density-3",
  "--demographics-density-4",
  "--demographics-density-5",
] as const;

export function colourForDensity(residentsPerHa: number): string {
  const stops = densityRampStops();
  const value = Math.max(0, residentsPerHa);
  let index = 0;
  for (let i = 1; i < stops.length; i++) {
    if (value > stops[i]) index = i;
    else break;
  }
  return getColour(DENSITY_VAR_KEYS[Math.min(index, DENSITY_VAR_KEYS.length - 1)]);
}

export function colourForMetric(
  metric: number | null,
  colourBy: "density" | "medianAge" | "rent" | "rentersPct",
): string {
  if (metric == null || !Number.isFinite(metric)) return getColour("--demographics-parcel-outside");
  switch (colourBy) {
    case "density":
      return colourForDensity(metric);
    case "medianAge":
      return colourForDensity(Math.max(0, (metric - 20) * 8));
    case "rent":
      return colourForDensity(Math.max(0, metric / 4));
    case "rentersPct":
      return colourForDensity(Math.max(0, metric * 1.2));
    default:
      return getColour("--demographics-parcel-outside");
  }
}
