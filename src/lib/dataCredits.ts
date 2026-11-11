
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
  comHeightsHtml?: string | null;
  comTreesHtml?: string | null;
  contourHtml?: string | null;
  cadastreOn?: boolean;
  nswCredit?: string | null;
};

const VICMAP_LINK =
  '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Vicmap © State of Victoria (CC BY 4.0)</a>';

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function modelStageCreditHtml(options: StageCreditOptions): string {
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
  explodedAxoOverlaysOn?: boolean;
  cadastreOn?: boolean;
  prefix?: string;
  nsw?: boolean;
};

const VICMAP_BASE_CREDIT = " Vicmap © State of Victoria (CC BY 4.0).";

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
