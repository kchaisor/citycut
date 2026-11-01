import type { SemanticHudLabel } from "../lib/semanticHudSample";

export function SemanticViewportLabels({ labels, visible }: { labels: SemanticHudLabel[]; visible: boolean }) {
  if (!visible || labels.length === 0) return null;
  return (
    <div className="semantic-viewport-labels" aria-hidden="true">
      {labels.map((label) => (
        <span
          key={label.id}
          className={label.kind === "street" ? "semantic-label is-street mono" : "semantic-label is-building mono"}
          style={{
            left: `${label.x}px`,
            top: `${label.y}px`,
            fontSize: `${12 * label.scale}px`,
          }}
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}
