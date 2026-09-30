import { useEffect, useId, useState } from "react";
import {
  DASH_PRESETS,
  STROKE_KEYS,
  STROKE_LABELS,
  copyCssText,
  dashPresetId,
  normalizeDash,
  parseColor,
  parseMm,
  patchStroke,
  type LineStyles,
  type StrokeKey,
} from "../lib/drawingStyle";

/**
 * Live site-plan pens. Collapsed until opened so the Drawing drawer stays short,
 * including in the mobile bottom sheet, which scrolls the same block.
 */
export function LineStylesEditor({
  style,
  baseline,
  onChange,
  onReset,
}: {
  style: LineStyles;
  baseline: LineStyles;
  onChange: (next: LineStyles) => void;
  onReset: () => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function copyCss() {
    const text = copyCssText(style, baseline);
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
    setNotice(copied ? "Copied. Paste it into src/drawing-style.css." : "Could not copy. Select the theme file and copy by hand.");
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
        <span>Line styles</span>
        <span className="line-styles-chevron" aria-hidden="true">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div id={panelId} className="line-styles-panel">
          <p className="field-note">
            Weights are millimetres on the sheet. The plan updates as you edit. A site-plan download uses these
            values.
          </p>
          <label className="line-style-fill">
            Road fill
            <input
              type="color"
              aria-label="Road fill colour"
              value={style.roadFill.toLowerCase()}
              onChange={(event) => {
                const color = parseColor(event.target.value);
                if (color) onChange({ ...style, roadFill: color });
              }}
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={style.kerbOn}
              onChange={(event) => onChange({ ...style, kerbOn: event.target.checked })}
            />
            Kerb outline
          </label>
          {STROKE_KEYS.map((key) => (
            <StyleRow key={key} name={key} style={style} onChange={onChange} />
          ))}
          <div className="line-styles-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                onReset();
                setNotice("Reset to the theme file.");
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

function StyleRow({
  name,
  style,
  onChange,
}: {
  name: StrokeKey;
  style: LineStyles;
  onChange: (next: LineStyles) => void;
}) {
  const stroke = style[name];
  const label = STROKE_LABELS[name];
  const preset = dashPresetId(stroke.dash);
  const [custom, setCustom] = useState(stroke.dash);
  useEffect(() => {
    setCustom(stroke.dash);
  }, [stroke.dash]);

  return (
    <div className="line-style-row">
      <span className="line-style-name">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={5}
        step={0.01}
        aria-label={`${label} weight in millimetres`}
        value={stroke.mm}
        onChange={(event) => {
          const mm = parseMm(event.target.value);
          if (mm == null) return;
          onChange(patchStroke(style, name, { mm }));
        }}
      />
      <input
        type="color"
        aria-label={`${label} colour`}
        value={stroke.color.toLowerCase()}
        onChange={(event) => {
          const color = parseColor(event.target.value);
          if (color) onChange(patchStroke(style, name, { color }));
        }}
      />
      <select
        aria-label={`${label} dash`}
        value={preset}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "custom") {
            const seed = preset === "custom" ? stroke.dash : "1 0.5";
            setCustom(seed);
            const dash = normalizeDash(seed);
            if (dash) onChange(patchStroke(style, name, { dash }));
            return;
          }
          const found = DASH_PRESETS.find((item) => item.id === next);
          if (found) onChange(patchStroke(style, name, { dash: found.value }));
        }}
      >
        {DASH_PRESETS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {preset === "custom" && (
        <input
          className="line-style-custom"
          aria-label={`${label} custom dash in millimetres`}
          value={custom}
          placeholder="1.5 0.75"
          onChange={(event) => {
            setCustom(event.target.value);
            const dash = normalizeDash(event.target.value);
            if (dash) onChange(patchStroke(style, name, { dash }));
          }}
        />
      )}
    </div>
  );
}
