import type { ArrowScreenLabel } from "./DiagramArrows3D";

export function DiagramArrowLabelLayer({ labels }: { labels: readonly ArrowScreenLabel[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="landmark-label-layer arrow-label-layer" data-arrow-labels="3d" aria-hidden="true">
      {labels.map((label) => (
        <div
          key={label.id}
          className="landmark-label arrow-label is-visible"
          style={{ left: label.x, top: label.y }}
          data-arrow-id={label.id}
        >
          {label.text}
        </div>
      ))}
    </div>
  );
}
