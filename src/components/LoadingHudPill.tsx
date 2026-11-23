import type { HTMLAttributes } from "react";
import { prefersReducedMotion, sunHoursProgressPercent } from "../lib/sunHoursProgress";

export function LoadingHudPill({
  label,
  progress = null,
  stage = null,
  placement = "float",
  className,
  reducedMotion,
  dotClassName,
  ...rest
}: {
  label: string;
  progress?: number | null;
  stage?: string | null;
  placement?: "float" | "inline";
  className?: string;
  reducedMotion?: boolean;
  dotClassName?: string;
} & HTMLAttributes<HTMLDivElement>) {
  const reduced = reducedMotion ?? prefersReducedMotion();
  const determinate = progress != null;
  const percent = determinate ? sunHoursProgressPercent(progress) : null;
  const readout = determinate ? percent : stage;
  const classes = [
    "loading-hud-pill",
    "hud-card",
    placement === "inline" ? "is-inline" : "",
    determinate ? "is-determinate" : "is-indeterminate",
    reduced ? "is-reduced" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      {...rest}
      className={classes}
      data-loading-progress={determinate ? percent : "indeterminate"}
      role={rest.role ?? "progressbar"}
      aria-label={rest["aria-label"] ?? label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={determinate ? Math.round(progress * 100) : undefined}
      aria-valuetext={determinate ? percent! : (stage ?? "Calculating")}
    >
      <div className="loading-hud-row">
        <span className={["loading-pulse-dot", dotClassName].filter(Boolean).join(" ")} aria-hidden="true" />
        <strong>{label}</strong>
        <div
          className={["loading-prog-track", determinate ? "" : "is-indeterminate"].filter(Boolean).join(" ")}
          aria-hidden="true"
        >
          {determinate ? (
            <div className="loading-prog-fill" style={{ width: percent! }} />
          ) : (
            <div className="loading-prog-shimmer" />
          )}
        </div>
        {readout ? <span className="loading-prog-pct mono">{readout}</span> : null}
      </div>
    </div>
  );
}
