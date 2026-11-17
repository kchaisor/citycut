import { Fragment } from "react";
import type { SiteWindSelection } from "../lib/windRoseData";
import { formatSkippedCloserLine, plainWindCaption, skippedCloserParts } from "../lib/windRoseCaptions";

export function WindSkippedCloser({ selection, className }: { selection: SiteWindSelection; className: string }) {
  const parts = skippedCloserParts(selection);
  if (!parts.length) return null;
  return (
    <p className={`${className} wind-rose-meta-skipped`} title={plainWindCaption(formatSkippedCloserLine(selection))}>
      Closer:{" "}
      {parts.map((part, i) => (
        <Fragment key={part.name}>
          {i > 0 ? " · " : null}
          <span className="wind-rose-skip">
            {part.name} <span className="wind-rose-skip-dist">{part.distance}</span>
            {part.reason ? ` (${part.reason})` : null}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
