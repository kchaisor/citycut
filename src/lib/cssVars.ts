/** Parse `:root` custom properties out of a stylesheet. Comments are removed first. */

export function parseCustomProperties(css: string): Record<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const values: Record<string, string> = {};
  for (const match of withoutComments.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
    values[match[1]] = match[2].trim();
  }
  return values;
}

/** Three-, six-, and eight-digit hex become uppercase six- or eight-digit hex. */
export function normalizeHex(value: string): string | null {
  const text = value.trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!hex) return null;
  let body = hex[1];
  if (body.length === 3) body = body.split("").map((char) => char + char).join("");
  return `#${body.toUpperCase()}`;
}

/** A stylesheet colour, or a computed red-green-blue function, as six-digit hex. */
export function cssColorToHex(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const hex = normalizeHex(raw);
  if (hex && hex.length === 7) return hex;
  if (hex && hex.length === 9) return hex.slice(0, 7);
  const rgb = raw.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!rgb) return null;
  const channel = (value: string) =>
    Math.max(0, Math.min(255, Math.round(Number(value))))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
}

/** Resolve a single `var(--name)` against the same sheet, then normalise a hex. */
export function resolveSheet(sheet: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  const visit = (name: string, seen: Set<string>): string => {
    const raw = sheet[name];
    if (raw == null) return "";
    const reference = raw.match(/^var\(\s*(--[A-Za-z0-9-]+)\s*\)$/);
    if (!reference) return cssColorToHex(raw) ?? raw;
    if (seen.has(reference[1])) return raw;
    seen.add(reference[1]);
    return visit(reference[1], seen);
  };
  for (const name of Object.keys(sheet)) resolved[name] = visit(name, new Set([name]));
  return resolved;
}
