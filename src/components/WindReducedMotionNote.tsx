export function WindReducedMotionNote({
  animateAnyway,
  onAnimateAnyway,
  className = "wind-reduced-motion-note",
}: {
  animateAnyway: boolean;
  onAnimateAnyway: (value: boolean) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p>Arrows paused (system reduced-motion setting)</p>
      <label className="wind-reduced-motion-toggle">
        <input
          type="checkbox"
          checked={animateAnyway}
          onChange={(event) => onAnimateAnyway(event.target.checked)}
        />
        Animate anyway
      </label>
    </div>
  );
}
