import { useMemo } from "react";
import {
  buildHeliodonDiagramOverlay,
  heliodonLabelFontMetres,
  type HeliodonDiagramInput,
} from "../lib/heliodonDiagram";
import { getColour } from "../lib/colours";
import { svgPolyline } from "../lib/svgPlan";
import { screenPx } from "../lib/lineweights";
import { SUN_PATH_STYLES } from "../lib/heliodonSunPaths";
import {
  hiddenBySunStudy,
  sunStudyDateArc,
  sunStudySuns,
  type SunStudyDate,
} from "../lib/sunStudyPlan";

function planLine(points: [number, number][], close = false) {
  return svgPolyline(
    points.map(([east, north]) => [east, north]),
    close,
  );
}

function SunNowIcon({ cx, cy, size, core = getColour("--sun-marker") }: { cx: number; cy: number; size: number; core?: string }) {
  const ink = getColour("--sun-compass-label");
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g aria-hidden="true">
      {rays.map((deg) => {
        const t = (deg * Math.PI) / 180;
        const x1 = cx + Math.cos(t) * size * 0.55;
        const y1 = cy + Math.sin(t) * size * 0.55;
        const x2 = cx + Math.cos(t) * size;
        const y2 = cy + Math.sin(t) * size;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={ink}
            strokeWidth={screenPx(0.12)}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={size * 0.42} fill={core} stroke={ink} strokeWidth={screenPx(0.1)} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

export function HeliodonPlanOverlay({
  input,
  planScale,
  sideM,
  sunStudy = null,
}: {
  input: HeliodonDiagramInput;
  /** Sun study on: hourly suns on this date's path replace the current-time sun and duplicate hour labels. */
  sunStudy?: SunStudyDate | null;
  planScale: number;
  /** Clips the diagram to the square site frame. */
  sideM: number;
}) {
  const overlay = useMemo(() => buildHeliodonDiagramOverlay(input), [input]);
  const ink = getColour("--sun-compass-label");
  const grey = getColour("--sun-compass");
  const degreeSize = heliodonLabelFontMetres(planScale, 6.5);
  const tickWidth = (tier: "minor" | "medium" | "major") =>
    screenPx(tier === "major" ? 0.22 : tier === "medium" ? 0.18 : 0.14);
  const R = overlay.radiusM;
  const half = sideM / 2;
  const clipId = `heliodon-frame-${sideM}`;
  const sunSize = R * 0.065;
  const hourFont = heliodonLabelFontMetres(planScale, 7);
  const studySuns = useMemo(
    () => (sunStudy ? sunStudySuns(sunStudy, R, sunSize, hourFont) : []),
    [sunStudy, R, sunSize, hourFont],
  );
  const studyArc = useMemo(() => {
    if (!sunStudy) return null;
    const onSeasonalArc =
      SUN_PATH_STYLES.some((style) => style.date.month === sunStudy.month && style.date.day === sunStudy.day) ||
      (sunStudy.month === 3 && sunStudy.day === 20);
    return onSeasonalArc ? null : sunStudyDateArc(sunStudy, R);
  }, [sunStudy, R]);
  const studySunFill = getColour("--sun-study-sun");

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect x={-half} y={-half} width={sideM} height={sideM} />
        </clipPath>
      </defs>
      <g className="heliodon-plan" aria-label="Sun path and compass" clipPath={`url(#${clipId})`}>
      {overlay.altitudeRings.map((ring, index) => (
        <path
          key={`alt-${index}`}
          d={planLine(
            ring.map(([e, n]) => [e, n]),
            true,
          )}
          fill="none"
          stroke={grey}
          strokeWidth={screenPx(0.16)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d={planLine(
          overlay.horizonRing.map(([e, n]) => [e, n]),
          true,
        )}
        fill="none"
        stroke={ink}
        strokeWidth={screenPx(0.24)}
        vectorEffect="non-scaling-stroke"
      />
      {overlay.ticks.map((tick, index) => (
        <line
          key={`tick-${index}`}
          x1={tick.a[0]}
          y1={-tick.a[1]}
          x2={tick.b[0]}
          y2={-tick.b[1]}
          stroke={tick.tier === "minor" ? grey : ink}
          strokeWidth={tickWidth(tick.tier)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {overlay.arcs.map((arc, index) => (
        <path
          key={`arc-${index}`}
          d={planLine(
            arc.points.map(([e, n]) => [e, n]),
            false,
          )}
          fill="none"
          stroke={arc.colour}
          strokeWidth={screenPx(0.22)}
          strokeDasharray={arc.dash}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {overlay.hourLines.map((line, index) => (
        <path
          key={`hour-${index}`}
          d={planLine(
            line.map(([e, n]) => [e, n]),
            false,
          )}
          fill="none"
          stroke={grey}
          strokeWidth={screenPx(0.12)}
          strokeDasharray={`${R * 0.008} ${R * 0.008}`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {overlay.hourDots.map(([east, north], index) => (
        <circle
          key={`dot-${index}`}
          cx={east}
          cy={-north}
          r={R * 0.008}
          fill={ink}
          stroke={ink}
          strokeWidth={screenPx(0.08)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {overlay.degreeLabels.map((label) => (
        <text
          key={label.text}
          x={label.east}
          y={-label.north}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={degreeSize}
          fill={grey}
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight={600}
        >
          {label.text}
        </text>
      ))}
      {overlay.cardinals.map((label) => (
        <text
          key={label.text}
          x={label.east}
          y={-label.north}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={heliodonLabelFontMetres(planScale, label.fontPt)}
          fill={ink}
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight={label.weight}
        >
          {label.text}
        </text>
      ))}
      {studyArc && studyArc.length >= 2 && (
        <path
          d={planLine(studyArc, false)}
          fill="none"
          stroke={ink}
          strokeWidth={screenPx(0.22)}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {overlay.hourLabels.filter((label) => !hiddenBySunStudy(label, studySuns, R)).map((label) => (
        <text
          key={`${label.text}-${label.east}`}
          x={label.east}
          y={-label.north}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={heliodonLabelFontMetres(planScale, 7)}
          fill={ink}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {label.text}
        </text>
      ))}
      {overlay.arcLabels.map((label) => (
        <text
          key={label.text}
          x={label.east}
          y={-label.north}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={heliodonLabelFontMetres(planScale, 7.5)}
          fill={ink}
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight={650}
        >
          {label.text}
        </text>
      ))}
      {!sunStudy && overlay.sun && <SunNowIcon cx={overlay.sun[0]} cy={-overlay.sun[1]} size={sunSize} />}
      {studySuns.map((sun) => (
        <g key={`study-${sun.hour}`} data-sun-hour={sun.hour}>
          <SunNowIcon cx={sun.at[0]} cy={-sun.at[1]} size={sunSize} core={studySunFill} />
          <text
            x={sun.labelAt[0]}
            y={-sun.labelAt[1]}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={hourFont}
            fontWeight={600}
            fill={ink}
            fontFamily="Helvetica, Arial, sans-serif"
          >
            {sun.label}
          </text>
        </g>
      ))}
      <text
        x={0}
        y={R + heliodonLabelFontMetres(planScale, 6) * 1.8}
        textAnchor="middle"
        fontSize={heliodonLabelFontMetres(planScale, 6)}
        fill={grey}
        fontFamily="Helvetica, Arial, sans-serif"
      >
        Sun path diagram, not to ground scale
      </text>
      </g>
    </>
  );
}
