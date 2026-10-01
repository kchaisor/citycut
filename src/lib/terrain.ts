import { fromLocal, squareBBox } from "./geo";
import type { LonLat, Pt, Ring, TerrainField } from "../types";

/**
 * Mapterhorn terrain tiles, verified against their docs on 2026-09-27.
 *
 * TileJSON https://tiles.mapterhorn.com/tilejson.json
 *   tiles: https://tiles.mapterhorn.com/{z}/{x}/{y}.webp
 *   encoding: terrarium
 *   tileSize: 512
 *   attribution: © Mapterhorn (https://mapterhorn.com/attribution)
 *   scheme: xyz
 * The TileJSON does not publish a maxzoom. Data access
 * (https://mapterhorn.com/data-access/) says planet coverage is z0–z12 and
 * regional archives continue through z17 where a finer source exists.
 * Melbourne answers z14 and returns 404 at z15, which matches the 5 m
 * Geoscience Australia lidar (CC BY 4.0) being fully resolved near z14.
 * Elsewhere the tiles fall back to Copernicus GLO-30.
 *
 * Terrarium, the same encoding MapLibre calls "terrarium":
 *   metres = R * 256 + G + B / 256 − 32768
 * CORS on the tile host sends Access-Control-Allow-Origin: *.
 */
export const TERRAIN_TILE_TEMPLATE = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";
export const TERRAIN_TILE_SIZE = 512;
export const TERRAIN_ATTRIBUTION_URL = "https://mapterhorn.com/attribution";
export const TERRAIN_UNAVAILABLE = "Terrain tiles could not be loaded, so the ground is flat.";

/** Nodes along one side of the heightfield, including both edges. */
const MAX_GRID_NODES = 193;

const EARTH_M = 2 * Math.PI * 6378137;

export type DecodedTile = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Row 0 is the north edge of the tile. Heights are metres. */
  heights: Float32Array;
};

/** Mapzen / MapLibre terrarium height in metres. */
export function terrariumHeight(red: number, green: number, blue: number): number {
  return red * 256 + green + blue / 256 - 32768;
}

/** Decode a tightly packed RGBA buffer (4 bytes per pixel, row 0 at the north). */
export function decodeTerrarium(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, pixel = 0; i < out.length; i++, pixel += 4) {
    out[i] = terrariumHeight(rgba[pixel], rgba[pixel + 1], rgba[pixel + 2]);
  }
  return out;
}

/**
 * Victorian ground, loosely. A downward Terrarium glitch of one red count is
 * −256 m and falls through the floor. An upward one can still sit under 2,000 m
 * around Melbourne, so the neighbourhood test below is what removes those needles.
 */
export const TERRAIN_ELEVATION_MIN_M = -50;
export const TERRAIN_ELEVATION_MAX_M = 2000;
/**
 * At about 5 m spacing, 15 m is a slope steeper than 70 degrees.
 * A plane of any grade matches the median of its neighbours, so a hillside stays.
 */
export const TERRAIN_SPIKE_M = 15;

export type HeightClampCounts = {
  /** Samples replaced because they jumped away from their neighbours. */
  spikes: number;
  /** Samples pulled back into the Victorian elevation band. */
  clamped: number;
};

function medianOf(values: number[], count: number): number {
  for (let i = 1; i < count; i++) {
    const value = values[i];
    let j = i - 1;
    while (j >= 0 && values[j] > value) {
      values[j + 1] = values[j];
      j -= 1;
    }
    values[j + 1] = value;
  }
  const mid = count >> 1;
  if (count % 2 === 1) return values[mid];
  return (values[mid - 1] + values[mid]) / 2;
}

function clampToVictoria(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < TERRAIN_ELEVATION_MIN_M) return TERRAIN_ELEVATION_MIN_M;
  if (value > TERRAIN_ELEVATION_MAX_M) return TERRAIN_ELEVATION_MAX_M;
  return value;
}

/**
 * Replace single-vertex spikes, then pull anything still outside the Victorian
 * band onto the nearest edge of it. Neighbours are read from the original
 * samples, so one bad pixel cannot talk the others into following it.
 * Writes into `heights` and returns how many samples changed.
 */
export function clampHeightOutliers(
  heights: Float32Array,
  cols: number,
  rows: number,
  spikeM = TERRAIN_SPIKE_M,
): HeightClampCounts {
  const source = new Float32Array(heights);
  const neighbours = new Array<number>(8);
  let spikes = 0;
  let clamped = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const value = source[index];
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const y = row + dy;
        if (y < 0 || y >= rows) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = col + dx;
          if (x < 0 || x >= cols) continue;
          const sample = source[y * cols + x];
          if (Number.isFinite(sample)) neighbours[count++] = sample;
        }
      }
      const median = count > 0 ? medianOf(neighbours, count) : 0;
      if (!Number.isFinite(value) || (count >= 3 && Math.abs(value - median) > spikeM)) {
        heights[index] = clampToVictoria(count > 0 ? median : 0);
        spikes += 1;
        continue;
      }
      if (value < TERRAIN_ELEVATION_MIN_M || value > TERRAIN_ELEVATION_MAX_M) {
        heights[index] = clampToVictoria(value);
        clamped += 1;
      }
    }
  }
  return { spikes, clamped };
}

function terrainOutlierNote(spikes: number, clamped: number): string | null {
  const parts: string[] = [];
  if (spikes > 0) {
    parts.push(
      `${spikes} sample${spikes === 1 ? "" : "s"} more than ${TERRAIN_SPIKE_M} m from the neighbourhood median`,
    );
  }
  if (clamped > 0) {
    parts.push(
      `${clamped} sample${clamped === 1 ? "" : "s"} outside ${TERRAIN_ELEVATION_MIN_M}–${TERRAIN_ELEVATION_MAX_M} m`,
    );
  }
  if (parts.length === 0) return null;
  return `CityCut adjusted terrain elevations: ${parts.join(", ")}.`;
}

/** Ground metres per pixel at `zoom`. Tiles are 512 px over one XYZ tile. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (EARTH_M * Math.cos((lat * Math.PI) / 180)) / (TERRAIN_TILE_SIZE * 2 ** zoom);
}

/**
 * Prefer about 5 m per pixel, the Geoscience Australia lidar spacing, and
 * never ask above z14. Higher zooms are upsampled where that source is absent,
 * and Melbourne's z15 tiles 404. The fetch steps down when a zoom is missing.
 */
export function preferredTerrainZoom(lat: number): number {
  const zoom = Math.round(Math.log2(metresPerPixel(lat, 0) / 5));
  return Math.min(14, Math.max(8, zoom));
}

/** Global pixel in the 512 px XYZ grid. Y increases south. */
export function webMercatorPixel(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const world = TERRAIN_TILE_SIZE * 2 ** zoom;
  const x = ((lon + 180) / 360) * world;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * world;
  return { x, y };
}

export function tilesForBBox(
  bounds: { west: number; south: number; east: number; north: number },
  zoom: number,
): { x: number; y: number }[] {
  const nw = webMercatorPixel(bounds.west, bounds.north, zoom);
  const se = webMercatorPixel(bounds.east, bounds.south, zoom);
  const x0 = Math.floor(nw.x / TERRAIN_TILE_SIZE);
  const x1 = Math.floor(se.x / TERRAIN_TILE_SIZE);
  const y0 = Math.floor(nw.y / TERRAIN_TILE_SIZE);
  const y1 = Math.floor(se.y / TERRAIN_TILE_SIZE);
  const tiles: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) tiles.push({ x, y });
  }
  return tiles;
}

export function terrainTileUrl(zoom: number, x: number, y: number): string {
  return `https://tiles.mapterhorn.com/${zoom}/${x}/${y}.webp`;
}

/** Pad the cut so bilinear samples at the square's edge stay inside fetched tiles. */
export function terrainFetchBBox(center: LonLat, sideM: number, zoom: number) {
  const pad = metresPerPixel(center.lat, zoom) * 4;
  return squareBBox(center, sideM + pad * 2);
}

export function terrainGridSize(lat: number, sideM: number, zoom: number): {
  cols: number;
  rows: number;
  spacingM: number;
  metresPerPixel: number;
} {
  const pixel = metresPerPixel(lat, zoom);
  const native = Math.ceil(sideM / Math.max(pixel, 0.5)) + 1;
  const cols = Math.min(MAX_GRID_NODES, Math.max(2, native));
  return {
    cols,
    rows: cols,
    spacingM: sideM / (cols - 1),
    metresPerPixel: pixel,
  };
}

function tilePixel(tiles: Map<string, DecodedTile>, ix: number, iy: number): number {
  const tx = Math.floor(ix / TERRAIN_TILE_SIZE);
  const ty = Math.floor(iy / TERRAIN_TILE_SIZE);
  const tile = tiles.get(`${tx}/${ty}`);
  if (!tile) throw new Error(TERRAIN_UNAVAILABLE);
  const col = Math.min(tile.width - 1, Math.max(0, ix - tx * TERRAIN_TILE_SIZE));
  const row = Math.min(tile.height - 1, Math.max(0, iy - ty * TERRAIN_TILE_SIZE));
  return tile.heights[row * tile.width + col];
}

function sampleTiles(tiles: Map<string, DecodedTile>, lon: number, lat: number, zoom: number): number {
  const { x, y } = webMercatorPixel(lon, lat, zoom);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const h00 = tilePixel(tiles, x0, y0);
  const h10 = tilePixel(tiles, x0 + 1, y0);
  const h01 = tilePixel(tiles, x0, y0 + 1);
  const h11 = tilePixel(tiles, x0 + 1, y0 + 1);
  const north = h00 * (1 - tx) + h10 * tx;
  const south = h01 * (1 - tx) + h11 * tx;
  return north * (1 - ty) + south * ty;
}

/** Resample decoded tiles onto a square grid in local east/north metres. */
export function heightFieldFromTiles(
  decoded: DecodedTile[],
  center: LonLat,
  sideM: number,
  zoom: number,
): TerrainField {
  if (decoded.length === 0) throw new Error(TERRAIN_UNAVAILABLE);
  let spikes = 0;
  let clamped = 0;
  const tiles = new Map<string, DecodedTile>();
  for (const tile of decoded) {
    const heights = new Float32Array(tile.heights);
    const counts = clampHeightOutliers(heights, tile.width, tile.height);
    spikes += counts.spikes;
    clamped += counts.clamped;
    tiles.set(`${tile.x}/${tile.y}`, { ...tile, heights });
  }
  const grid = terrainGridSize(center.lat, sideM, zoom);
  const heights = new Float32Array(grid.cols * grid.rows);
  const half = sideM / 2;
  for (let row = 0; row < grid.rows; row++) {
    const north = -half + row * grid.spacingM;
    for (let col = 0; col < grid.cols; col++) {
      const east = -half + col * grid.spacingM;
      const geographic = fromLocal([east, north], center);
      const height = sampleTiles(tiles, geographic.lon, geographic.lat, zoom);
      if (!Number.isFinite(height)) throw new Error(TERRAIN_UNAVAILABLE);
      heights[row * grid.cols + col] = height;
    }
  }
  const fieldCounts = clampHeightOutliers(heights, grid.cols, grid.rows);
  spikes += fieldCounts.spikes;
  clamped += fieldCounts.clamped;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < heights.length; i++) {
    const height = heights[i];
    if (height < min) min = height;
    if (height > max) max = height;
  }
  const note = terrainOutlierNote(spikes, clamped);
  if (note) console.info(note);
  return {
    cols: grid.cols,
    rows: grid.rows,
    heights,
    min,
    max,
    spacingM: grid.spacingM,
    zoom,
    metresPerPixel: grid.metresPerPixel,
    source: "Mapterhorn",
  };
}

/** Bilinear DEM sample. Points outside the square clamp to the edge. */
export function sampleTerrain(field: TerrainField, east: number, north: number, sideM: number): number {
  const half = sideM / 2;
  const u = Math.min(1, Math.max(0, (east + half) / sideM));
  const v = Math.min(1, Math.max(0, (north + half) / sideM));
  const x = u * (field.cols - 1);
  const y = v * (field.rows - 1);
  const x0 = Math.min(field.cols - 1, Math.floor(x));
  const y0 = Math.min(field.rows - 1, Math.floor(y));
  const x1 = Math.min(field.cols - 1, x0 + 1);
  const y1 = Math.min(field.rows - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (col: number, row: number) => field.heights[row * field.cols + col];
  const south = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const northEdge = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return south * (1 - ty) + northEdge * ty;
}

/**
 * Base elevation for an extruded footprint: the lowest sample on the outer
 * ring. The whole solid starts there, so a corner cannot float. The uphill
 * side may meet the terrain part-way up the wall.
 */
export function footprintBase(field: TerrainField, ring: Ring, sideM: number): number {
  let min = Infinity;
  for (let i = 0; i < ring.length; i++) {
    min = Math.min(min, sampleTerrain(field, ring[i][0], ring[i][1], sideM));
  }
  if (!Number.isFinite(min)) return sampleTerrain(field, 0, 0, sideM);
  return min;
}

/**
 * Contour interval from the relief across the cut.
 * Under 8 m → 1 m, under 25 m → 2 m, under 80 m → 5 m, otherwise 10 m.
 */
export function contourInterval(reliefM: number): number {
  if (reliefM < 8) return 1;
  if (reliefM < 25) return 2;
  if (reliefM < 80) return 5;
  return 10;
}

export function contourLevels(min: number, max: number, interval: number): number[] {
  if (interval <= 0 || max - min < interval * 0.25) return [];
  const levels: number[] = [];
  let level = Math.ceil((min + interval * 1e-6) / interval) * interval;
  const limit = max - interval * 1e-4;
  for (let guard = 0; level < limit && guard < 400; guard++) {
    levels.push(Math.round(level * 1000) / 1000);
    level += interval;
  }
  return levels;
}

const MARCH: number[][][] = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [],
  [[1, 2]],
  [[3, 1]],
  [[0, 1]],
  [[3, 0]],
  [],
];

function lerpPoint(p: Pt, q: Pt, hp: number, hq: number, level: number): Pt {
  const span = hq - hp;
  const t = Math.abs(span) < 1e-9 ? 0.5 : (level - hp) / span;
  const u = Math.min(1, Math.max(0, t));
  return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
}

function edgePoint(
  edge: number,
  sw: Pt,
  se: Pt,
  ne: Pt,
  nw: Pt,
  hsw: number,
  hse: number,
  hne: number,
  hnw: number,
  level: number,
): Pt {
  if (edge === 0) return lerpPoint(sw, se, hsw, hse, level);
  if (edge === 1) return lerpPoint(se, ne, hse, hne, level);
  if (edge === 2) return lerpPoint(nw, ne, hnw, hne, level);
  return lerpPoint(sw, nw, hsw, hnw, level);
}

function pointKey(point: Pt): string {
  return `${Math.round(point[0] * 100) / 100},${Math.round(point[1] * 100) / 100}`;
}

function stitchContours(segments: { a: Pt; b: Pt }[]): Pt[][] {
  const nodes = segments.map((segment) => ({ a: segment.a, b: segment.b, used: false }));
  const at = new Map<string, number[]>();
  const add = (key: string, index: number) => {
    const list = at.get(key);
    if (list) list.push(index);
    else at.set(key, [index]);
  };
  nodes.forEach((node, index) => {
    add(pointKey(node.a), index);
    add(pointKey(node.b), index);
  });
  const take = (key: string): number | null => {
    const list = at.get(key);
    if (!list) return null;
    while (list.length > 0) {
      const index = list.pop();
      if (index !== undefined && !nodes[index].used) return index;
    }
    return null;
  };
  const lines: Pt[][] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].used) continue;
    nodes[i].used = true;
    const line: Pt[] = [nodes[i].a, nodes[i].b];
    for (;;) {
      const next = take(pointKey(line[line.length - 1]));
      if (next === null) break;
      const node = nodes[next];
      node.used = true;
      const tail = pointKey(line[line.length - 1]);
      line.push(pointKey(node.a) === tail ? node.b : node.a);
    }
    for (;;) {
      const next = take(pointKey(line[0]));
      if (next === null) break;
      const node = nodes[next];
      node.used = true;
      const head = pointKey(line[0]);
      line.unshift(pointKey(node.b) === head ? node.a : node.b);
    }
    if (line.length >= 2) lines.push(line);
  }
  return lines;
}

export type LeveledContour = { line: Pt[]; z: number };

/** Marching-squares contours in local east/north metres, one polyline per level. */
export function leveledContourLines(
  field: TerrainField,
  sideM: number,
  interval = contourInterval(field.max - field.min),
): LeveledContour[] {
  const levels = contourLevels(field.min, field.max, interval);
  if (levels.length === 0 || field.cols < 2 || field.rows < 2) return [];
  const half = sideM / 2;
  const at = (col: number, row: number) => field.heights[row * field.cols + col];
  const locate = (col: number, row: number): Pt => [
    -half + col * field.spacingM,
    -half + row * field.spacingM,
  ];
  const lines: LeveledContour[] = [];
  for (const level of levels) {
    const segments: { a: Pt; b: Pt }[] = [];
    for (let row = 0; row < field.rows - 1; row++) {
      for (let col = 0; col < field.cols - 1; col++) {
        const hsw = at(col, row);
        const hse = at(col + 1, row);
        const hne = at(col + 1, row + 1);
        const hnw = at(col, row + 1);
        let bits = 0;
        if (hsw >= level) bits |= 1;
        if (hse >= level) bits |= 2;
        if (hne >= level) bits |= 4;
        if (hnw >= level) bits |= 8;
        let cases = MARCH[bits];
        if (bits === 5 || bits === 10) {
          const center = (hsw + hse + hne + hnw) / 4;
          cases = bits === 5
            ? center >= level
              ? [[3, 0], [1, 2]]
              : [[0, 1], [2, 3]]
            : center >= level
              ? [[0, 1], [2, 3]]
              : [[3, 0], [1, 2]];
        }
        const sw = locate(col, row);
        const se = locate(col + 1, row);
        const ne = locate(col + 1, row + 1);
        const nw = locate(col, row + 1);
        for (const [left, right] of cases) {
          segments.push({
            a: edgePoint(left, sw, se, ne, nw, hsw, hse, hne, hnw, level),
            b: edgePoint(right, sw, se, ne, nw, hsw, hse, hne, hnw, level),
          });
        }
      }
    }
    for (const line of stitchContours(segments)) lines.push({ line, z: level });
  }
  return lines;
}

/** Marching-squares contours in local east/north metres. */
export function contourLines(field: TerrainField, sideM: number, interval = contourInterval(field.max - field.min)): Pt[][] {
  return leveledContourLines(field, sideM, interval).map((item) => item.line);
}

export function terrainNote(field: TerrainField, contours: boolean): string {
  const interval = contourInterval(field.max - field.min);
  const contourText = contours ? ` Contours are every ${interval} m on the site plan.` : "";
  return `Terrain is Mapterhorn zoom ${field.zoom} (about ${field.metresPerPixel.toFixed(1)} m per tile pixel, gridded every ${field.spacingM.toFixed(1)} m). Elevations ${field.min.toFixed(1)}–${field.max.toFixed(1)} m. Each building sits on the lowest sample along its footprint.${contourText} © Mapterhorn.`;
}

function shadeHeight(t: number, darken: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t));
  const red = (0.718 + (0.953 - 0.718) * u) * darken;
  const green = (0.655 + (0.925 - 0.655) * u) * darken;
  const blue = (0.576 + (0.898 - 0.576) * u) * darken;
  return [red, green, blue];
}

/** One heightfield surface, in Three.js coordinates (x east, y up, z = −north). No skirt or base. */
export function terrainBuffers(field: TerrainField, sideM: number): {
  positions: Float32Array;
  indices: Uint32Array;
  colors: Float32Array;
} {
  const { cols, rows } = field;
  const half = sideM / 2;
  const relief = Math.max(field.max - field.min, 0.001);
  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);
  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const east = -half + col * field.spacingM;
      const north = -half + row * field.spacingM;
      const y = field.heights[row * cols + col];
      const offset = (row * cols + col) * 3;
      positions[offset] = east;
      positions[offset + 1] = y;
      positions[offset + 2] = -north;
      const tint = shadeHeight((y - field.min) / relief, 1);
      colors[offset] = tint[0];
      colors[offset + 1] = tint[1];
      colors[offset + 2] = tint[2];
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const sw = row * cols + col;
      const se = sw + 1;
      const nw = sw + cols;
      const ne = nw + 1;
      indices[index++] = sw;
      indices[index++] = se;
      indices[index++] = ne;
      indices[index++] = sw;
      indices[index++] = ne;
      indices[index++] = nw;
    }
  }
  return { positions, indices, colors };
}
