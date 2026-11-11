import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { WALK_RIPPLE_BANDS_MIN, WALK_RIPPLE_TIMELINE_MAX_MIN } from "../lib/walkRippleNetwork";

type WalkRippleTimeScrubberProps = {
  minutes: number;
  reachedBuildingCount: number;
  disabled: boolean;
  playing: boolean;
  onMinutesChange: (minutes: number) => void;
  onPlayToggle: () => void;
};

function clampMinutes(value: number): number {
  return Math.max(0, Math.min(WALK_RIPPLE_TIMELINE_MAX_MIN, value));
}

function formatMinuteLabel(minutes: number): string {
  const rounded = Math.round(minutes * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function WalkRippleTimeScrubber({
  minutes,
  reachedBuildingCount,
  disabled,
  playing,
  onMinutesChange,
  onPlayToggle,
}: WalkRippleTimeScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const minutesFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return minutes;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return minutes;
      const u = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(u * WALK_RIPPLE_TIMELINE_MAX_MIN * 20) / 20;
    },
    [minutes],
  );

  const thumbPct = Math.max(2, Math.min(98, (minutes / WALK_RIPPLE_TIMELINE_MAX_MIN) * 100));

  const onTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onMinutesChange(minutesFromClientX(event.clientX));
  };

  const onTrackPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    onMinutesChange(minutesFromClientX(event.clientX));
  };

  const onTrackPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next = minutes;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = clampMinutes(minutes + (event.shiftKey ? 1 : 0.25));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = clampMinutes(minutes - (event.shiftKey ? 1 : 0.25));
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = WALK_RIPPLE_TIMELINE_MAX_MIN;
    } else {
      return;
    }
    event.preventDefault();
    onMinutesChange(next);
  };

  return (
    <>
      <button
        type="button"
        className={playing ? "play-pill mono active" : "play-pill mono"}
        aria-label={playing ? "Pause walk ripple replay" : "Replay walk ripple 0–20 min"}
        aria-pressed={playing}
        disabled={disabled}
        onClick={onPlayToggle}
      >
        {playing ? "❚❚ 1×" : "▶ 1×"}
      </button>
      <div
        ref={scrubRef}
        className="daylight-scrubber walk-ripple-scrubber mono"
        role="group"
        aria-label="Walk ripple time scrubber"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
      >
        <span className="sun-bound" aria-hidden="true">
          0
        </span>
        <div
          ref={trackRef}
          className="scrubber-track walk-ripple-scrubber-track"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={WALK_RIPPLE_TIMELINE_MAX_MIN}
          aria-valuenow={minutes}
          aria-label="Walk ripple time"
          aria-disabled={disabled}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
        >
          <div className="walk-ripple-scrubber-band" aria-hidden="true" />
          {WALK_RIPPLE_BANDS_MIN.map((min) => (
            <button
              key={min}
              type="button"
              className={`walk-ripple-tick band-${min}${Math.abs(minutes - min) < 0.12 ? " active" : ""}`}
              style={{ left: `${(min / WALK_RIPPLE_TIMELINE_MAX_MIN) * 100}%` }}
              aria-label={`${min} minutes`}
              aria-pressed={Math.abs(minutes - min) < 0.12}
              disabled={disabled}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onMinutesChange(min)}
            >
              {min}
            </button>
          ))}
          <div className="scrubber-thumb walk-ripple-scrubber-thumb" style={{ left: `${thumbPct}%` }} aria-hidden="true" />
        </div>
        <span className="sun-bound" aria-hidden="true">
          20
        </span>
        <span
          className="time-readout-pill walk-ripple-time-readout"
          data-walk-ripple-minutes={formatMinuteLabel(minutes)}
          data-walk-ripple-reached={String(reachedBuildingCount)}
        >
          ◉ {formatMinuteLabel(minutes)} min
        </span>
      </div>
    </>
  );
}
