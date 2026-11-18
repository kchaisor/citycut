type Props = {
  visible: boolean;
  widthM: number;
  lengthM: number;
  boundaryM: number;
  x: number;
  y: number;
};

export function MassingToolHud({ visible, widthM, lengthM, boundaryM, x, y }: Props) {
  if (!visible) return null;
  return (
    <div
      className="massing-cursor-pill hud-card mono"
      style={{ left: x + 16, top: y + 16 }}
      role="status"
      aria-live="polite"
    >
      <span>{widthM.toFixed(0)} m × {lengthM.toFixed(1)} m</span>
      <span className="massing-cursor-sep" aria-hidden="true">
        ·
      </span>
      <span>{boundaryM.toFixed(1)} m to edge</span>
    </div>
  );
}
