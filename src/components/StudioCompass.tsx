import { getColour } from "../lib/colours";
import {
  studioCompassAriaLabel,
  studioCompassNeedleDeg,
} from "../lib/studioCompass";

export function StudioCompassNeedle({ headingDeg }: { headingDeg: number }) {
  const chip = getColour("--studio-compass-chip");
  const ring = getColour("--studio-compass-chip-ring");
  const north = getColour("--studio-compass-needle-north");
  const south = getColour("--studio-compass-needle-south");
  const needleDeg = studioCompassNeedleDeg(headingDeg);
  return (
    <svg
      className="studio-compass-needle"
      viewBox="0 0 56 56"
      width="56"
      height="56"
      aria-hidden="true"
    >
      <circle cx="28" cy="28" r="27.5" fill={chip} stroke={ring} strokeWidth="1" />
      <g transform={`rotate(${needleDeg} 28 28)`}>
        <path d="M28 7.84 L33.6 26.88 L28 29.12 L22.4 26.88 Z" fill={north} />
        <path d="M28 48.16 L33.6 26.88 L28 29.12 L22.4 26.88 Z" fill={south} />
      </g>
    </svg>
  );
}

export function StudioCompass({ headingDeg }: { headingDeg: number }) {
  return (
    <div className="studio-compass" role="img" aria-label={studioCompassAriaLabel(headingDeg)}>
      <StudioCompassNeedle headingDeg={headingDeg} />
    </div>
  );
}