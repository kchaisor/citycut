import { useEffect, useId, useState, useSyncExternalStore } from "react";
import {
  COLOUR_GROUPS,
  COLOUR_LABELS,
  colourCssText,
  colourRevision,
  commitColour,
  getColour,
  resetStoredColours,
  subscribeColours,
  type ColourKey,
} from "../lib/colours";
import { applyOverrides, readStoredOverrides } from "../lib/drawingStyle";

/**
 * Live fills. Collapsed until opened, in the same drawer as the line styles.
 * Edits are remembered as `citycut.colours` and applied as inline custom properties.
 */
export function ColoursEditor({ onChange }: { onChange?: () => void }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const revision = useSyncExternalStore(subscribeColours, colourRevision, colourRevision);
  void revision;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function copyCss() {
    const text = colourCssText();
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
    if (!copied) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "true");
      document.body.appendChild(area);
      area.select();
      try {
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
      area.remove();
    }
    setNotice(copied ? "Copied. Paste it into src/colours.css." : "Could not copy. Select the colour file and copy by hand.");
  }

  return (
    <div className="line-styles">
      <button
        type="button"
        className="line-styles-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Colours</span>
        <span className="line-styles-chevron" aria-hidden="true">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div id={panelId} className="line-styles-panel">
          <p className="field-note">
            Fills for the plan, the 3D view, and the downloads. The drawing updates as you edit.
          </p>
          {COLOUR_GROUPS.map((group) => (
            <fieldset key={group.id} className="colour-group">
              <legend>{group.title}</legend>
              {group.keys.map((key) => (
                <ColourRow
                  key={key}
                  name={key}
                  onPick={(value) => {
                    commitColour(key, value);
                    onChange?.();
                  }}
                />
              ))}
            </fieldset>
          ))}
          <div className="line-styles-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                resetStoredColours(undefined, () => {
                  try {
                    applyOverrides(readStoredOverrides(window.localStorage));
                  } catch {
                    // A locked storage area still leaves the file colours in place.
                  }
                });
                onChange?.();
                setNotice("Reset to the colour file.");
              }}
            >
              Reset to defaults
            </button>
            <button type="button" className="ghost" onClick={() => void copyCss()}>
              Copy CSS
            </button>
          </div>
          {notice && (
            <p className="line-styles-notice" role="status">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ColourRow({ name, onPick }: { name: ColourKey; onPick: (value: string) => void }) {
  const value = getColour(name);
  const label = COLOUR_LABELS[name];
  return (
    <label className="colour-row">
      <span className="colour-swatch" style={{ background: value }} aria-hidden="true" />
      <span className="colour-name">
        {label}
        <span className="colour-key">{name}</span>
      </span>
      <input
        type="color"
        aria-label={`${label} colour`}
        value={value.toLowerCase()}
        onChange={(event) => onPick(event.target.value)}
      />
    </label>
  );
}
