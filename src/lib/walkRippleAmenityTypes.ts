export const WALK_RIPPLE_AMENITY_TYPES = ["cafe", "school", "park", "transport"] as const;

export type WalkRippleAmenityType = (typeof WALK_RIPPLE_AMENITY_TYPES)[number];

export type WalkRippleAmenity = {
  id: number;
  type: WalkRippleAmenityType;
  name: string;
  east: number;
  north: number;
  osmInferredName: boolean;
};

export const WALK_RIPPLE_AMENITY_LABEL: Record<WalkRippleAmenityType, string> = {
  cafe: "Café / restaurant",
  school: "School",
  park: "Park",
  transport: "Public transport",
};

export const WALK_RIPPLE_AMENITY_COLOUR_TOKEN: Record<WalkRippleAmenityType, `--walk-ripple-amenity-${WalkRippleAmenityType}`> = {
  cafe: "--walk-ripple-amenity-cafe",
  school: "--walk-ripple-amenity-school",
  park: "--walk-ripple-amenity-park",
  transport: "--walk-ripple-amenity-transport",
};

export function defaultAmenityTypeFilters(): Record<WalkRippleAmenityType, boolean> {
  return { cafe: true, school: true, park: true, transport: true };
}
