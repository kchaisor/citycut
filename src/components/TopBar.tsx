import { Mark } from "./Mark";

export function TopBar({
  showNewCut,
  note,
  onHome,
  onNewCut,
}: {
  showNewCut: boolean;
  note?: string;
  onHome: () => void;
  onNewCut: () => void;
}) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={onHome}>
        <Mark />
        <span>CityCut</span>
      </button>
      {note ? <p className="top-note">{note}</p> : <span />}
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
