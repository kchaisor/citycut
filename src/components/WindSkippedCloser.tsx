import { ChevronRight } from "lucide-react";
import type { SiteWindSelection } from "../lib/windRoseData";
import { formatSkippedCloserLine, plainWindCaption, skippedCloserParts, type SkippedCloserPart } from "../lib/windRoseCaptions";

function CloserStation({ part }: { part: SkippedCloserPart }) {
  return (
    <span className="wind-rose-skip">
      {part.name} <span className="wind-rose-skip-dist">{part.distance}</span>
      {part.reason ? ` (${part.reason})` : null}
    </span>
  );
}

export function WindNearbyStations({ selection, className }: { selection: SiteWindSelection; className: string }) {
  const parts = skippedCloserParts(selection);
  if (!parts.length) return null;
  return (
    <details className={`${className} wind-rose-nearby`} title={plainWindCaption(formatSkippedCloserLine(selection))}>
      <summary>
        <ChevronRight className="wind-rose-nearby-chevron" size={14} strokeWidth={1.75} aria-hidden="true" />
        Nearby stations
      </summary>
      <ul className="wind-rose-nearby-list">
        {parts.map((part) => (
          <li key={part.name}>
            <CloserStation part={part} />
          </li>
        ))}
      </ul>
    </details>
  );
}
