import drawingCss from "../drawing-style.css?raw";
import themeCss from "../theme.css?raw";
import { cssColorToHex, parseCustomProperties, resolveSheet } from "./cssVars";

const drawing = resolveSheet(parseCustomProperties(drawingCss));
const theme = resolveSheet(parseCustomProperties(themeCss));

function hexFrom(sheet: Record<string, string>, name: string, file: string): string {
  const value = cssColorToHex(sheet[name] ?? "");
  if (!value) throw new Error(`${file} is missing ${name}`);
  return value.length === 9 ? value.slice(0, 7) : value;
}

/** A line colour from drawing-style.css, for the no-document fallback. */
export function drawingSheetColor(name: string): string {
  return hexFrom(drawing, name, "drawing-style.css");
}

/** A theme colour from theme.css, for the no-document fallback. */
export function themeSheetColor(name: string): string {
  return hexFrom(theme, name, "theme.css");
}
