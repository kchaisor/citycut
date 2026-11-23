import type { PrevailingStream } from "../lib/windPrevailingStreams";

const SWATCH_PATH = "M0 5.4 L15 4.2 L14.2 1 L24 5 L14.2 9 L15 5.8 L0 5.6 Z";

export function PrevailingStreamsLegend({
  streams,
  periodLabel,
  muted = false,
}: {
  streams: readonly PrevailingStream[];
  periodLabel: string;
  muted?: boolean;
}) {
  if (streams.length === 0) return null;
  return (
    <section className={muted ? "wind-streams-legend is-muted" : "wind-streams-legend"} aria-label="Prevailing streams">
      <header className="wind-streams-legend-head">
        <span className="wind-streams-legend-title">Prevailing streams</span>
        <span className="wind-streams-legend-meta mono">{periodLabel}</span>
      </header>
      <ul className="wind-streams-legend-list">
        {streams.map((stream) => (
          <li key={stream.sector} className="wind-streams-legend-row" data-wind-stream={stream.rank + 1}>
            <svg className="wind-streams-legend-swatch" viewBox="0 0 24 10" width="24" height="10" aria-hidden="true">
              <path d={SWATCH_PATH} fill={`var(${stream.token})`} />
            </svg>
            <span className="wind-streams-legend-text">
              From {stream.label} · <span className="mono">{stream.meanSpeedMs.toFixed(1)} m/s</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
