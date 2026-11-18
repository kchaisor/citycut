import type { MassingBlock } from "../lib/massingBlock";
import { MASSING_DEFAULT_WIDTH_M, MASSING_FLOOR_HEIGHT_M } from "../lib/massingBlock";

type Props = {
  block: MassingBlock | null;
  onFloors: (floors: number) => void;
  onWidth: (widthM: number) => void;
  onFlip: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
};

export function MassingToolPanel({ block, onFloors, onWidth, onFlip, onDelete, onDuplicate }: Props) {
  if (!block) return null;
  return (
    <div className="massing-tool-panel sidebar-group outliner-section" aria-label="Massing block">
      <div className="card-head sidebar-gh">
        <h3 className="card-title">Massing</h3>
        <span className="card-meta mono">{block.floors} fl · {block.width_m.toFixed(0)} m</span>
      </div>
      <div className="massing-tool-grid">
        <label className="massing-field">
          <span>Floors</span>
          <div className="massing-stepper">
            <button type="button" aria-label="Decrease floors" onClick={() => onFloors(Math.max(1, block.floors - 1))}>
              −
            </button>
            <input
              type="number"
              min={1}
              max={80}
              step={1}
              value={block.floors}
              onChange={(event) => onFloors(Math.max(1, Number(event.target.value) || 1))}
            />
            <button type="button" aria-label="Increase floors" onClick={() => onFloors(block.floors + 1)}>
              +
            </button>
          </div>
        </label>
        <label className="massing-field">
          <span>Width (m)</span>
          <input
            type="number"
            min={4}
            max={80}
            step={0.5}
            value={block.width_m}
            onChange={(event) => onWidth(Math.max(4, Number(event.target.value) || MASSING_DEFAULT_WIDTH_M))}
          />
        </label>
        <button type="button" className="secondary massing-flip-btn" onClick={onFlip}>
          Flip
        </button>
        <button type="button" className="secondary" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="danger massing-delete-btn" onClick={onDelete}>
          Delete
        </button>
      </div>
      <p className="field-note mono">Floor height {block.floorHeight_m.toFixed(1)} m · {MASSING_FLOOR_HEIGHT_M} m default</p>
    </div>
  );
}
