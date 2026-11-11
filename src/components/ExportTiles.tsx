import { useState } from "react";
import type { ExportTile, ExportTileId } from "../lib/exportTiles";

export function ExportTiles({
  tiles,
  progress,
  onDownload,
}: {
  tiles: ExportTile[];
  progress?: string | null;
  onDownload: (id: ExportTileId) => void;
}) {
  const [hover, setHover] = useState<ExportTileId | null>(null);
  const shown = tiles.find((tile) => tile.id === hover) ?? null;
  return (
    <div className="export-tiles-wrap">
      <div className="export-tiles" role="group" aria-label="Download formats">
        {tiles.map((tile, index) => (
          <button
            key={tile.id}
            type="button"
            className="export-tile"
            data-tile={tile.id}
            data-autofocus={index === 0 ? "true" : undefined}
            aria-label={tile.ariaLabel}
            aria-disabled={!tile.enabled}
            aria-describedby="export-tile-note"
            title={tile.disabledReason ?? tile.description}
            onMouseEnter={() => setHover(tile.id)}
            onMouseLeave={() => setHover((id) => (id === tile.id ? null : id))}
            onFocus={() => setHover(tile.id)}
            onBlur={() => setHover((id) => (id === tile.id ? null : id))}
            onClick={() => {
              if (tile.enabled) onDownload(tile.id);
            }}
          >
            <span className="export-tile-app">{tile.app}</span>
            <span className="export-tile-ext">{tile.ext}</span>
            {tile.busy && <span className="export-tile-busy">Preparing{progress ? ` ${progress}` : ""}…</span>}
          </button>
        ))}
      </div>
      <p id="export-tile-note" className="export-tile-note" aria-live="polite">
        {shown ? (shown.disabledReason ?? shown.description) : "Hover a format for what is in the file."}
      </p>
    </div>
  );
}
