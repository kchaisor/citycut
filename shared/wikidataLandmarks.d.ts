export const WIKIDATA_SCHEMA_VERSION: number;
export const WIKIDATA_SPARQL_URL: string;
export const WIKIDATA_ATTRIBUTION: string;
export const LANDMARK_CLASSES: string[];

export type WikidataBox = { west: number; south: number; east: number; north: number };

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
  osmWayIds?: number[];
};

export type SparqlBinding = Record<string, { value: string } | undefined>;

export type GroupedWikidataItems = Map<string, unknown>;

export type WikidataDropCounts = { noEnglishLabel: number; noCoordinateInBbox: number };

export function landmarkQuery(cell: WikidataBox): string;
export function landmarkQueryUrl(cell: WikidataBox): string;
export function qidFromUri(uri: string | null | undefined): string | null;
export function parseWktPoint(value: string | null | undefined): { lon: number; lat: number } | null;
export function yearFromWikidataDate(value: string | null | undefined): number | null;
export function checkSparqlJson(body: unknown): SparqlBinding[];
export function groupBindings(rows: SparqlBinding[], accumulator?: GroupedWikidataItems): GroupedWikidataItems;
export function finaliseItems(
  grouped: GroupedWikidataItems,
  bbox: WikidataBox,
): { items: WikidataLandmark[]; dropped: WikidataDropCounts };
