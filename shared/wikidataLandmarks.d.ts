export type WikidataBbox = { west: number; south: number; east: number; north: number };

export type WikidataLinked = { qid: string; name: string | null };

export type WikidataLandmark = {
  qid: string;
  name: string;
  lon: number;
  lat: number;
  heightsM: number[];
  floorsAboveGround: number | null;
  yearBuilt: number | null;
  yearOpened: number | null;
  architects: WikidataLinked[];
  styles: WikidataLinked[];
  heritage: WikidataLinked[];
  wikipedia: string | null;
};

export type WikidataLandmarksDocument = {
  schemaVersion: number;
  generatedAt: string;
  bbox: WikidataBbox;
  attribution: string;
  items: WikidataLandmark[];
};

export type WikidataDropped = { noEnglishLabel: number; noCoordinateInBbox: number };

export type WikidataBinding = Record<string, { value: string } | undefined>;

export const WIKIDATA_SCHEMA_VERSION: number;
export const WIKIDATA_LANDMARKS_NAME: string;
export const WIKIDATA_MANIFEST_NAME: string;
export const WIKIDATA_SPARQL_URL: string;
export const WIKIDATA_ATTRIBUTION: string;
export const ARCHITECTURAL_STRUCTURE: string;
export const RAILWAY_STATION: string;
export const LANDMARK_CLASSES: string[];
export const GREATER_MELBOURNE_BBOX: WikidataBbox;

export function landmarkQuery(cell: WikidataBbox, classQid?: string): string;
export function landmarkQueryUrl(cell: WikidataBbox, classQid?: string): string;
export function checkSparqlJson(body: unknown): WikidataBinding[];
export function groupBindings(rows: WikidataBinding[], accumulator?: Map<string, unknown>): Map<string, unknown>;
export function finaliseItems(grouped: Map<string, unknown>, bbox: WikidataBbox): { items: WikidataLandmark[]; dropped: WikidataDropped };
