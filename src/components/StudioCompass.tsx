import { getColour } from "../lib/colours";

export function StudioCompassRose({ needleDeg }: { needleDeg: number }) {
  const ink = getColour("--sun-compass-label");
  const paper = getColour("--primary-surface");
  const r = 18;
  const tick = 6;
  const wingW = 9;
  const apexY = 6;
  const wingY = 20;
  const notchY = 25;
  return (
    <svg
      className="studio-compass-rose"
      width="44"
      height="44"
      viewBox="0 0 44 44"
      aria-hidden="true"
      style={{ transform: `rotate(${needleDeg}deg)` }}
    >
      <g transform="translate(22 24)">
        <circle cx={0} cy={0} r={r} fill="none" stroke={ink} strokeWidth={1.2} />
        <line x1={-r - tick} y1={0} x2={-r * 0.55} y2={0} stroke={ink} strokeWidth={1} />
        <line x1={r * 0.55} y1={0} x2={r + tick} y2={0} stroke={ink} strokeWidth={1} />
        <line x1={0} y1={r * 0.45} x2={0} y2={r + tick} stroke={ink} strokeWidth={1} />
        <polygon points={`0,${-apexY} ${-wingW},${wingY} 0,${notchY}`} fill={ink} stroke={ink} strokeWidth={1} />
        <polygon points={`0,${-apexY} ${wingW},${wingY} 0,${notchY}`} fill={paper} stroke={ink} strokeWidth={1} />
        <text
          x={0}
          y={-apexY - 5}
          textAnchor="middle"
          fontSize="9"
          fontWeight={700}
          letterSpacing="0.08em"
          fill={ink}
          fontFamily="Inter, Helvetica, Arial, sans-serif"
        >
          N
        </text>
      </g>
    </svg>
  );
}

export function StudioCompass({ needleDeg }: { needleDeg: number }) {
  return (
    <div className="studio-compass" aria-hidden="true">
      <StudioCompassRose needleDeg={needleDeg} />
    </div>
  );
}
