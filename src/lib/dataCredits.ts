/** Short on-screen and export attribution strings (single OSM mention via Overture ODbL). */

export const DATA_CREDIT_BASE =
  "© Overture Maps Foundation, OpenStreetMap contributors (ODbL), Microsoft. Terrain © Mapterhorn. Vicmap © State of Victoria (CC BY 4.0).";

export const DATA_CREDIT_PT_VIC =
  " Public transport lines and stops © Public Transport Victoria / Department of Transport (CC BY 4.0).";

export const DATA_CREDIT_WIND_SUFFIX = " Wind: Open-Meteo (CC BY 4.0).";

export const DATA_CREDIT_ESRI_SATELLITE =
  " Satellite imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community.";

export const DATA_CREDIT_VICMAP_PROPERTY =
  " Cadastre: Vicmap Property © State of Victoria (Department of Transport and Planning), CC BY 4.0.";

export const CITYCUT_BYLINE = "CityCut · Kelvin Chai";

export type StageCreditOptions = {
  windOn: boolean;
  satelliteOn: boolean;
  /** Linked CoM building heights line when the toggle is on. */
  comHeightsHtml?: string | null;
  /** Linked CoM urban forest credit when the cut has CoM trees. */
  comTreesHtml?: string | null;
  contourHtml?: string | null;
  /** Vicmap Property parcels on the exploded axo cadastre plate. */
  cadastreOn?: boolean;
  /** NSW mode credit line (exact strings from sources/registry). */
  nswCredit?: string | null;
};

const VICMAP_LINK =
  '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Vicmap © State of Victoria (CC BY 4.0)</a>';

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Footer on the model viewport (may include HTML links). */
export function modelStageCreditHtml(options: StageCreditOptions): string {
  // NSW mode (nswCredit set) uses no Vicmap data, so the Vicmap credit is dropped there only.
  const base = DATA_CREDIT_BASE.replace(
    options.nswCredit ? " Vicmap © State of Victoria (CC BY 4.0)." : "Vicmap © State of Victoria (CC BY 4.0).",
    options.nswCredit ? "" : `${VICMAP_LINK}.`,
  ).replace("Terrain © Mapterhorn.", '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener noreferrer">Terrain © Mapterhorn</a>.');
  const parts = [base];
  if (options.windOn) parts.push(DATA_CREDIT_WIND_SUFFIX.trim());
  if (options.satelliteOn) parts.push(DATA_CREDIT_ESRI_SATELLITE.trim());
  if (options.comHeightsHtml) parts.push(options.comHeightsHtml);
  if (options.comTreesHtml) parts.push(options.comTreesHtml);
  if (options.contourHtml) parts.push(options.contourHtml);
  if (options.cadastreOn && !options.nswCredit) parts.push(DATA_CREDIT_VICMAP_PROPERTY.trim());
  if (options.nswCredit) parts.push(`${escapeHtml(options.nswCredit)}.`);
  parts.push(CITYCUT_BYLINE);
  return parts.join(" ");
}

export type PlainCreditOptions = {
  windOn?: boolean;
  satelliteOn?: boolean;
  /** Include Vicmap planning/hydro/rail/contour and PT Vic attributions for exploded axo exports. */
  explodedAxoOverlaysOn?: boolean;
  /** Vicmap Property parcels on the exploded axo cadastre plate. */
  cadastreOn?: boolean;
  /** Prefix such as "CityCut." for export bars. */
  prefix?: string;
  /** NSW mode: no Victorian data is used, so the Vicmap and PTV credits are left out. */
  nsw?: boolean;
};

const VICMAP_BASE_CREDIT = " Vicmap © State of Victoria (CC BY 4.0).";

/** Plain text for PDF, AI, Rhino, and PNG overlays. */
export function plainDataCredit(options: PlainCreditOptions = {}): string {
  const chunks: string[] = [];
  if (options.prefix) chunks.push(options.prefix);
  chunks.push(options.nsw ? DATA_CREDIT_BASE.replace(VICMAP_BASE_CREDIT, "") : DATA_CREDIT_BASE);
  if (options.windOn) chunks.push(DATA_CREDIT_WIND_SUFFIX.trim());
  if (options.satelliteOn) chunks.push(DATA_CREDIT_ESRI_SATELLITE.trim());
  if (options.explodedAxoOverlaysOn && !options.nsw) chunks.push(DATA_CREDIT_PT_VIC.trim());
  if (options.cadastreOn && !options.nsw) chunks.push(DATA_CREDIT_VICMAP_PROPERTY.trim());
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}
