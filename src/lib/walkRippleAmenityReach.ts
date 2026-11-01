import { buildWalkNetwork, buildingArrivalMinutes, type RippleTimes } from "./walkRippleNetwork";
import type { WalkRippleAmenity, WalkRippleAmenityType } from "./walkRippleAmenityTypes";
import type { CityModel } from "../types";

export type AmenityArrival = WalkRippleAmenity & { arrivalMin: number };

export function assignAmenityArrivals(
  amenities: readonly WalkRippleAmenity[],
  times: RippleTimes,
  model: Pick<CityModel, "roads">,
): AmenityArrival[] {
  const network = times.mode === "network" ? buildWalkNetwork(model.roads) : null;
  return amenities.map((amenity) => ({
    ...amenity,
    arrivalMin: buildingArrivalMinutes(times, [amenity.east, amenity.north], network),
  }));
}

export function countAmenitiesReached(
  arrivals: readonly AmenityArrival[],
  rippleMinutes: number,
  typeEnabled: Record<WalkRippleAmenityType, boolean>,
  epsilon = 0.04,
): Record<WalkRippleAmenityType, number> {
  const counts: Record<WalkRippleAmenityType, number> = { cafe: 0, school: 0, park: 0, transport: 0 };
  const cutoff = rippleMinutes + epsilon;
  for (const amenity of arrivals) {
    if (!typeEnabled[amenity.type]) continue;
    if (amenity.arrivalMin <= cutoff) counts[amenity.type] += 1;
  }
  return counts;
}

export function formatWalkMinutes(minutes: number): string {
  const rounded = Math.round(minutes * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
