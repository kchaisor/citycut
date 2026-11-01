import { formatWalkMinutes } from "../lib/walkRippleAmenityReach";
import { WALK_RIPPLE_AMENITY_LABEL, type WalkRippleAmenityType } from "../lib/walkRippleAmenityTypes";

type WalkRippleAmenityCardProps = {
  name: string;
  type: WalkRippleAmenityType;
  arrivalMin: number;
  osmInferredName: boolean;
  clientX: number;
  clientY: number;
  onClose: () => void;
};

export function WalkRippleAmenityCard({
  name,
  type,
  arrivalMin,
  osmInferredName,
  clientX,
  clientY,
  onClose,
}: WalkRippleAmenityCardProps) {
  const left = Math.min(Math.max(clientX, 120), window.innerWidth - 120);
  const top = Math.min(Math.max(clientY, 80), window.innerHeight - 80);
  return (
    <div
      className="walk-ripple-amenity-card hud-card"
      role="dialog"
      aria-label="Amenity beacon"
      style={{ left, top }}
    >
      <button type="button" className="walk-ripple-amenity-card-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <p className="walk-ripple-amenity-card-name">{name}</p>
      <p className="walk-ripple-amenity-card-type">{WALK_RIPPLE_AMENITY_LABEL[type]}</p>
      <p className="walk-ripple-amenity-card-time mono">{formatWalkMinutes(arrivalMin)} min walk</p>
      {osmInferredName ? <p className="field-note walk-ripple-amenity-card-note">Name inferred from OpenStreetMap tags</p> : null}
    </div>
  );
}
