import { Mark } from "./Mark";

export function TopBar({
  showNewCut,
  place,
  size,
  onHome,
  onNewCut,
}: {
  showNewCut: boolean;
  place?: string;
  size?: string;
  onHome: () => void;
  onNewCut: () => void;
}) {
  const full = place && size ? `${place} · ${size}` : place || "";
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={onHome}>
        <Mark />
        <span>CityCut</span>
      </button>
      {place ? (
        <p className="top-note" title={full}>
          <span className="top-note-place">{place}</span>
          {size ? <span className="top-note-size"> · {size}</span> : null}
        </p>
      ) : (
        <span />
      )}
      <nav className="top-actions">
        {showNewCut && (
          <button className="text-btn" type="button" onClick={onNewCut}>
            New cut
          </button>
        )}
      </nav>
    </header>
  );
}
