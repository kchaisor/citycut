export const WIKIDATA_SCHEMA_VERSION = 1;
export const WIKIDATA_LANDMARKS_NAME = "wikidata-landmarks.json";
export const WIKIDATA_MANIFEST_NAME = "wikidata-landmarks-manifest.json";
export const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
export const WIKIDATA_ATTRIBUTION = "Wikidata (CC0)";
export const ARCHITECTURAL_STRUCTURE = "Q811979";

export const GREATER_MELBOURNE_BBOX = { west: 144.333634, south: -38.502988, east: 145.878412, north: -37.175099 };

const ENTITY_PREFIX = "http://www.wikidata.org/entity/";
const MULTI_FIELDS = [
  ["architect", "architects"],
  ["style", "styles"],
  ["heritage", "heritage"],
];

export function bboxCells(bbox, stepDeg) {
  if (!(stepDeg > 0)) throw new Error(`Cell size must be positive, got ${stepDeg}.`);
  const cols = Math.ceil((bbox.east - bbox.west) / stepDeg - 1e-9);
  const rows = Math.ceil((bbox.north - bbox.south) / stepDeg - 1e-9);
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        west: bbox.west + c * stepDeg,
        south: bbox.south + r * stepDeg,
        east: Math.min(bbox.east, bbox.west + (c + 1) * stepDeg),
        north: Math.min(bbox.north, bbox.south + (r + 1) * stepDeg),
      });
    }
  }
  return cells;
}

const wktPoint = (lon, lat) => `"Point(${lon} ${lat})"^^geo:wktLiteral`;

export function landmarkQuery(cell) {
  return `SELECT ?item ?label ?coord ?height ?floors ?inception ?opened ?article
  ?architect ?architectLabel ?style ?styleLabel ?heritage ?heritageLabel WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest ${wktPoint(cell.west, cell.south)} .
    bd:serviceParam wikibase:cornerNorthEast ${wktPoint(cell.east, cell.north)} .
  }
  ?item wdt:P31/wdt:P279* wd:${ARCHITECTURAL_STRUCTURE} .
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
  OPTIONAL { ?item p:P2048 ?heightStatement . ?heightStatement a wikibase:BestRank ; psn:P2048/wikibase:quantityAmount ?height . }
  OPTIONAL { ?item wdt:P1101 ?floors }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P1619 ?opened }
  OPTIONAL { ?item wdt:P84 ?architect . OPTIONAL { ?architect rdfs:label ?architectLabel FILTER(LANG(?architectLabel) = "en") } }
  OPTIONAL { ?item wdt:P149 ?style . OPTIONAL { ?style rdfs:label ?styleLabel FILTER(LANG(?styleLabel) = "en") } }
  OPTIONAL { ?item wdt:P1435 ?heritage . OPTIONAL { ?heritage rdfs:label ?heritageLabel FILTER(LANG(?heritageLabel) = "en") } }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
}`;
}

export function landmarkQueryUrl(cell) {
  const url = new URL(WIKIDATA_SPARQL_URL);
  url.searchParams.set("query", landmarkQuery(cell));
  url.searchParams.set("format", "json");
  return url.toString();
}

export function qidFromUri(uri) {
  if (typeof uri !== "string" || !uri.startsWith(ENTITY_PREFIX)) return null;
  const qid = uri.slice(ENTITY_PREFIX.length);
  return /^Q\d+$/.test(qid) ? qid : null;
}

export function parseWktPoint(value) {
  const match = /^\s*Point\(\s*(-?[\d.]+(?:e-?\d+)?)\s+(-?[\d.]+(?:e-?\d+)?)\s*\)\s*$/i.exec(value ?? "");
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  return Number.isFinite(lon) && Number.isFinite(lat) ? { lon, lat } : null;
}

export function yearFromWikidataDate(value) {
  const match = /^([+-]?)(\d{1,6})-/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[2]) * (match[1] === "-" ? -1 : 1);
  return Number.isFinite(year) && year !== 0 ? year : null;
}

export function checkSparqlJson(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.results?.bindings)) {
    throw new Error("Wikidata SPARQL answer had no results.bindings array.");
  }
  return body.results.bindings;
}

const bindingValue = (row, key) => row[key]?.value ?? null;

function numberOrNull(value) {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function emptyItem(qid) {
  return {
    qid,
    names: new Set(),
    coords: new Set(),
    heights: new Set(),
    floors: new Set(),
    inception: new Set(),
    opened: new Set(),
    articles: new Set(),
    architects: new Map(),
    styles: new Map(),
    heritage: new Map(),
  };
}

function minOrNull(values) {
  return values.length ? Math.min(...values) : null;
}

function linkedList(map) {
  return [...map.entries()]
    .map(([qid, name]) => ({ qid, name }))
    .sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
}

export function groupBindings(rows, accumulator = new Map()) {
  for (const row of rows) {
    const qid = qidFromUri(bindingValue(row, "item"));
    if (!qid) continue;
    const item = accumulator.get(qid) ?? emptyItem(qid);
    accumulator.set(qid, item);
    const add = (set, value) => value !== null && set.add(value);
    add(item.names, bindingValue(row, "label"));
    add(item.coords, bindingValue(row, "coord"));
    add(item.heights, numberOrNull(bindingValue(row, "height")));
    add(item.floors, numberOrNull(bindingValue(row, "floors")));
    add(item.inception, yearFromWikidataDate(bindingValue(row, "inception")));
    add(item.opened, yearFromWikidataDate(bindingValue(row, "opened")));
    add(item.articles, bindingValue(row, "article"));
    for (const [key, field] of MULTI_FIELDS) {
      const linked = qidFromUri(bindingValue(row, key));
      if (!linked) continue;
      const name = bindingValue(row, `${key}Label`);
      if (!item[field].has(linked) || (name && !item[field].get(linked))) item[field].set(linked, name);
    }
  }
  return accumulator;
}

export function finaliseItem(item, bbox) {
  const name = [...item.names].sort()[0] ?? null;
  if (!name) return { item: null, reason: "noEnglishLabel" };
  const point = [...item.coords]
    .map(parseWktPoint)
    .filter((p) => p && p.lon >= bbox.west && p.lon <= bbox.east && p.lat >= bbox.south && p.lat <= bbox.north)
    .sort((a, b) => a.lon - b.lon || a.lat - b.lat)[0];
  if (!point) return { item: null, reason: "noCoordinateInBbox" };
  const floors = [...item.floors].filter((f) => f > 0);
  return {
    item: {
      qid: item.qid,
      name,
      lon: Number(point.lon.toFixed(7)),
      lat: Number(point.lat.toFixed(7)),
      heightsM: [...item.heights].filter((h) => h > 0).sort((a, b) => a - b),
      floorsAboveGround: floors.length ? Math.max(...floors) : null,
      yearBuilt: minOrNull([...item.inception]),
      yearOpened: minOrNull([...item.opened]),
      architects: linkedList(item.architects),
      styles: linkedList(item.styles),
      heritage: linkedList(item.heritage),
      wikipedia: [...item.articles].sort()[0] ?? null,
    },
    reason: null,
  };
}

export function finaliseItems(grouped, bbox) {
  const items = [];
  const dropped = { noEnglishLabel: 0, noCoordinateInBbox: 0 };
  for (const raw of grouped.values()) {
    const { item, reason } = finaliseItem(raw, bbox);
    if (item) items.push(item);
    else dropped[reason] += 1;
  }
  items.sort((a, b) => Number(a.qid.slice(1)) - Number(b.qid.slice(1)));
  return { items, dropped };
}

export function landmarksDocument(items, { bbox, generatedAt }) {
  return {
    schemaVersion: WIKIDATA_SCHEMA_VERSION,
    generatedAt,
    bbox,
    attribution: WIKIDATA_ATTRIBUTION,
    items,
  };
}

export function landmarksManifest({ bbox, generatedAt, cellDeg, cells, rows, items, dropped, sha256, bytes }) {
  return {
    schemaVersion: WIKIDATA_SCHEMA_VERSION,
    file: WIKIDATA_LANDMARKS_NAME,
    source: WIKIDATA_SPARQL_URL,
    attribution: WIKIDATA_ATTRIBUTION,
    queryDate: generatedAt,
    bbox,
    cellDeg,
    cells,
    rows,
    itemCount: items.length,
    withHeight: items.filter((i) => i.heightsM.length > 0).length,
    withWikipedia: items.filter((i) => i.wikipedia).length,
    dropped,
    bytes,
    sha256,
  };
}

export function minimumItemsCheck(count, minimum) {
  if (count < minimum) {
    throw new Error(`Wikidata returned ${count} landmarks, fewer than the ${minimum} floor; not publishing.`);
  }
}
