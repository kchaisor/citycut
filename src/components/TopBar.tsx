import { Mark } from "./Mark";

export function TopBar({
  showNewCut,
  onHome,
  onNewCut,
}: {
  showNewCut: boolean;
  onHome: () => void;
  onNewCut: () => void;
}) {
  return (
    <header className="topbar">
      <button className="brand" type="button" onClick={onHome}>
        <Mark />
        <span>CityCut</span>
      </button>
      {showNewCut && (
        <nav className="top-actions">
          <button className="text-btn" type="button" onClick={onNewCut}>
            New cut
          </button>
        </nav>
      )}
    </header>
  );
}
