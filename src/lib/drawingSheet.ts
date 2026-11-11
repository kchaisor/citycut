import coloursCss from "../colours.css?raw";
import drawingCss from "../drawing-style.css?raw";
import themeCss from "../theme.css?raw";
import { cssColorToHex, parseCustomProperties, resolveSheet } from "./cssVars";

const drawing = resolveSheet({
  ...parseCustomProperties(coloursCss),
  ...parseCustomProperties(drawingCss),
});
const theme = resolveSheet(parseCustomProperties(themeCss));

function hexFrom(sheet: Record<string, string>, name: string, file: string): string {
  const value = cssColorToHex(sheet[name] ?? "");
  if (!value) throw new Error(`${file} is missing ${name}`);
  return value.length === 9 ? value.slice(0, 7) : value;
}

export function drawingSheetColor(name: string): string {
  return hexFrom(drawing, name, "drawing-style.css");
}

export function themeSheetColor(name: string): string {
  return hexFrom(theme, name, "theme.css");
}
