import {
  WALK_RIPPLE_AMENITY_COLOUR_TOKEN,
  WALK_RIPPLE_AMENITY_TYPES,
  WALK_RIPPLE_AMENITY_LABEL,
  type WalkRippleAmenityType,
} from "../lib/walkRippleAmenityTypes";

type WalkRippleAmenityCountsProps = {
  counts: Record<WalkRippleAmenityType, number>;
  filters: Record<WalkRippleAmenityType, boolean>;
  loading: boolean;
  unavailable: boolean;
};

export function WalkRippleAmenityCounts({ counts, filters, loading, unavailable }: WalkRippleAmenityCountsProps) {
  if (loading) {
    return (
      <div className="walk-ripple-amenity-counts" role="status" data-walk-ripple-amenities-ready="false">
        <span className="walk-ripple-amenity-loading">Amenities…</span>
      </div>
    );
  }
  if (unavailable) {
    return (
      <div className="walk-ripple-amenity-counts" role="status" data-walk-ripple-amenities-ready="true">
        <span className="walk-ripple-amenity-unavailable">Amenities unavailable</span>
      </div>
    );
  }
  return (
    <div
      className="walk-ripple-amenity-counts mono"
      aria-label="Amenity beacons reached"
      data-walk-ripple-amenities-ready="true"
    >
      {WALK_RIPPLE_AMENITY_TYPES.map((type) => (
        <span
          key={type}
          className={filters[type] ? "walk-ripple-amenity-count" : "walk-ripple-amenity-count muted"}
          data-amenity-type={type}
          data-amenity-count={String(counts[type])}
        >
          <i style={{ background: `var(${WALK_RIPPLE_AMENITY_COLOUR_TOKEN[type]})` }} aria-hidden="true" />
          {WALK_RIPPLE_AMENITY_LABEL[type].split(" ")[0]} {counts[type]}
        </span>
      ))}
    </div>
  );
}
