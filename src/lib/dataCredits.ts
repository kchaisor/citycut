/** Short on-screen and export attribution strings (single OSM mention via Overture ODbL). */

export const DATA_CREDIT_BASE =
  "© Overture Maps Foundation, OpenStreetMap contributors (ODbL), Microsoft. Terrain © Mapterhorn. Vicmap © State of Victoria (CC BY 4.0).";

export const DATA_CREDIT_WIND_SUFFIX = " Wind: Open-Meteo (CC BY 4.0).";

export const DATA_CREDIT_ESRI_SATELLITE =
  " Satellite imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community.";

export const CITYCUT_BYLINE = "CityCut · Kelvin Chai";

export type StageCreditOptions = {
  windOn: boolean;
  satelliteOn: boolean;
  /** Linked CoM building heights line when the toggle is on. */
  comHeightsHtml?: string | null;
  contourHtml?: string | null;
};

const VICMAP_LINK =
  '<a href="https://creativecommons.org/licenses/by/4.0/">Vicmap © State of Victoria (CC BY 4.0)</a>';

/** Footer on the model viewport (may include HTML links). */
export function modelStageCreditHtml(options: StageCreditOptions): string {
  const base = DATA_CREDIT_BASE.replace(
    "Vicmap © State of Victoria (CC BY 4.0).",
    `${VICMAP_LINK}.`,
  ).replace("Terrain © Mapterhorn.", '<a href="https://mapterhorn.com/attribution">Terrain © Mapterhorn</a>.');
  const parts = [base];
  if (options.windOn) parts.push(DATA_CREDIT_WIND_SUFFIX.trim());
  if (options.satelliteOn) parts.push(DATA_CREDIT_ESRI_SATELLITE.trim());
  if (options.comHeightsHtml) parts.push(options.comHeightsHtml);
  if (options.contourHtml) parts.push(options.contourHtml);
  parts.push(CITYCUT_BYLINE);
  return parts.join(" ");
}

export type PlainCreditOptions = {
  windOn?: boolean;
  satelliteOn?: boolean;
  /** Prefix such as "CityCut." for export bars. */
  prefix?: string;
};

/** Plain text for PDF, AI, Rhino, and PNG overlays. */
export function plainDataCredit(options: PlainCreditOptions = {}): string {
  const chunks: string[] = [];
  if (options.prefix) chunks.push(options.prefix);
  chunks.push(DATA_CREDIT_BASE);
  if (options.windOn) chunks.push(DATA_CREDIT_WIND_SUFFIX.trim());
  if (options.satelliteOn) chunks.push(DATA_CREDIT_ESRI_SATELLITE.trim());
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}
