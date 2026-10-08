/**
 * Kelvin Fitzroy junction crop (~28 m): park paths + road on the east edge.
 * Fallback matches manual match to Kelvin's screenshot.
 */
import { writeFileSync } from "node:fs";

export const KELVIN_FITZROY_VIEWBOX = "8 102 30 30";

writeFileSync("/opt/cursor/artifacts/kelvin-fitzroy-viewbox.txt", KELVIN_FITZROY_VIEWBOX);
console.log(JSON.stringify({ vb: KELVIN_FITZROY_VIEWBOX }));
