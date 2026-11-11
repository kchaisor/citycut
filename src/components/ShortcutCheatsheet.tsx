import { KEYBOARD_CHEATSHEET_ROWS } from "../lib/modelKeyboard";

export function ShortcutCheatsheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="shortcut-cheatsheet-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="shortcut-cheatsheet hud-card"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shortcut-cheatsheet-head">
          <strong>Shortcuts</strong>
          <button type="button" className="shortcut-cheatsheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <ul className="shortcut-cheatsheet-list">
          {KEYBOARD_CHEATSHEET_ROWS.map((row) => (
            <li key={row.key}>
              <kbd className="mono">{row.key}</kbd>
              <span>{row.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
