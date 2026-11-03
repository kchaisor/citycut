import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { cellToLatLng, latLngToCell, gridDisk, greatCircleDistance } from "h3-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "reach");

const CBD = { lat: -37.8136, lon: 144.9631 };
const RADIUS_KM = 12;
const RES = 9;
const WALK_KMH = 4.8;
const WALK_MPM = (WALK_KMH * 1000) / 60;
const UNREACHABLE = 255;

const GTFS_URL = "https://data.ptv.vic.gov.au/downloads/gtfs.zip";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function kmBetween(aLat, aLon, bLat, bLon) {
  return greatCircleDistance([aLat, aLon], [bLat, bLon], "km");
}

function edgeMin(m) {
  return m / WALK_MPM;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (ch === "," && !inQuote) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i]?.trim() ?? "";
    });
    return row;
  });
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function tryGtfs() {
  const zipPath = path.join(outDir, "gtfs.zip");
  if (!fs.existsSync(zipPath)) {
    try {
      await download(GTFS_URL, zipPath);
    } catch {
      return null;
    }
  }
  const { execFileSync } = await import("node:child_process");
  const extractDir = path.join(outDir, "gtfs");
  fs.mkdirSync(extractDir, { recursive: true });
  const regionMarker = path.join(extractDir, "1", "google_transit.zip");
  if (!fs.existsSync(regionMarker)) {
    try {
      execFileSync("unzip", ["-qo", zipPath, "-d", extractDir], { stdio: "pipe" });
    } catch {
      return null;
    }
  }
  const regionZips = fs
    .readdirSync(extractDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(extractDir, d.name, "google_transit.zip"))
    .filter((p) => fs.existsSync(p));
  const stops = [];
  const metroRegions = new Set(["1", "2", "3"]);
  for (const regionZip of regionZips) {
    const regionId = path.basename(path.dirname(regionZip));
    if (!metroRegions.has(regionId)) continue;
    const regionDir = path.join(extractDir, regionId, "extract");
    fs.mkdirSync(regionDir, { recursive: true });
    const stopsPath = path.join(regionDir, "stops.txt");
    if (!fs.existsSync(stopsPath)) {
      try {
        execFileSync("unzip", ["-qo", regionZip, "-d", regionDir], { stdio: "pipe" });
      } catch {
        continue;
      }
    }
    if (!fs.existsSync(stopsPath)) continue;
    for (const row of parseCsv(fs.readFileSync(stopsPath, "utf8"))) {
      const lat = Number.parseFloat(row.stop_lat);
      const lon = Number.parseFloat(row.stop_lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (kmBetween(lat, lon, CBD.lat, CBD.lon) > RADIUS_KM + 2) continue;
      stops.push(row);
    }
  }
  if (stops.length === 0) return null;
  return { stops, retrieved: new Date().toISOString().slice(0, 10) };
}

async function tryOverpassWalkMultiplier() {
  const south = CBD.lat - 0.12;
  const north = CBD.lat + 0.12;
  const west = CBD.lon - 0.15;
  const east = CBD.lon + 0.15;
  const query = `[out:json][timeout:120];(way["highway"~"^(footway|path|pedestrian|living_street|residential|tertiary|secondary)$"](${south},${west},${north},${east}););out geom 1;`;
  try {
    const res = await fetch(OVERPASS_URL, { method: "POST", body: query });
    if (!res.ok) return null;
    const json = await res.json();
    const ways = json.elements?.filter((e) => e.type === "way" && e.geometry?.length > 1) ?? [];
    if (ways.length < 100) return null;
    let sum = 0;
    let count = 0;
    for (const way of ways) {
      for (let i = 0; i < way.geometry.length - 1; i++) {
        const a = way.geometry[i];
        const b = way.geometry[i + 1];
        const geo = greatCircleDistance([a.lat, a.lon], [b.lat, b.lon], "m");
        sum += geo;
        count += 1;
      }
    }
    if (count === 0) return null;
    return { retrieved: new Date().toISOString().slice(0, 10), ways: ways.length };
  } catch {
    return null;
  }
}

function buildCells() {
  const center = latLngToCell(CBD.lat, CBD.lon, RES);
  const cells = new Set();
  for (let k = 0; k <= 52; k++) {
    for (const h of gridDisk(center, k)) {
      const [lat, lon] = cellToLatLng(h);
      if (kmBetween(lat, lon, CBD.lat, CBD.lon) <= RADIUS_KM) cells.add(h);
    }
    if (k > 10 && cells.size > 800) {
      const sample = [...cells][0];
      const [lat] = cellToLatLng(sample);
      if (k > 40) break;
    }
  }
  return [...cells];
}

function buildGraph(cells) {
  const index = new Map(cells.map((h, i) => [h, i]));
  const neighbors = [];
  const edgeMinutes = [];
  for (const h of cells) {
    const i = index.get(h);
    const nbrs = [];
    const weights = [];
    for (const n of gridDisk(h, 1)) {
      if (n === h) continue;
      const j = index.get(n);
      if (j === undefined) continue;
      const [aLat, aLon] = cellToLatLng(h);
      const [bLat, bLon] = cellToLatLng(n);
      nbrs.push(j);
      weights.push(edgeMin(greatCircleDistance([aLat, aLon], [bLat, bLon], "m")));
    }
    neighbors.push({ nbrs, weights });
  }
  return { neighbors, edgeMinutes: neighbors.map((n) => n.weights), nbrIndex: neighbors.map((n) => n.nbrs) };
}

function nearestCellIndex(cells, lat, lon) {
  const h = latLngToCell(lat, lon, RES);
  const idx = cells.indexOf(h);
  if (idx >= 0) return idx;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const [la, lo] = cellToLatLng(cells[i]);
    const d = kmBetween(la, lo, lat, lon);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function walkAllFrom(origin, nbrIndex, edgeMinutes, maxMin) {
  const n = nbrIndex.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = [{ i: origin, t: 0 }];
  dist[origin] = 0;
  while (heap.length) {
    heap.sort((a, b) => a.t - b.t);
    const { i, t } = heap.shift();
    if (t > dist[i] + 1e-6) continue;
    if (t > maxMin) continue;
    const nbrs = nbrIndex[i];
    const weights = edgeMinutes[i];
    for (let k = 0; k < nbrs.length; k++) {
      const j = nbrs[k];
      const nt = t + weights[k];
      if (nt < dist[j]) {
        dist[j] = nt;
        heap.push({ i: j, t: nt });
      }
    }
  }
  return dist;
}

function buildPtTables(cells, nbrIndex, edgeMinutes, gtfs) {
  const cellCount = cells.length;
  const stationRecords = [];
  if (!gtfs) {
    const anchors = [
      { name: "Flinders Street", lat: -37.8183, lon: 144.9671, modes: ["train"] },
      { name: "Parliament", lat: -37.8114, lon: 144.9737, modes: ["train"] },
      { name: "Flagstaff", lat: -37.8119, lon: 144.9546, modes: ["train"] },
      { name: "Jolimont", lat: -37.817, lon: 144.9854, modes: ["train"] },
      { name: "Royal Park", lat: -37.7836, lon: 144.9507, modes: ["train"] },
    ];
    for (const a of anchors) {
      stationRecords.push({
        name: a.name,
        cellIndex: nearestCellIndex(cells, a.lat, a.lon),
        modes: a.modes,
      });
    }
  } else {
    const byMode = { train: [], tram: [], bus: [] };
    for (const stop of gtfs.stops) {
      const lat = Number.parseFloat(stop.stop_lat);
      const lon = Number.parseFloat(stop.stop_lon);
      const idx = nearestCellIndex(cells, lat, lon);
      const parent = stop.parent_station ?? "";
      const mode = parent.includes(":rail:") || /station/i.test(stop.stop_name) ? "train" : /tram/i.test(stop.stop_name) ? "tram" : "bus";
      byMode[mode].push({ name: stop.stop_name, cellIndex: idx, modes: [mode] });
    }
    const pick = (list, n) => list.slice(0, n);
    stationRecords.push(
      ...pick(byMode.train, 40),
      ...pick(byMode.tram, 40),
      ...pick(byMode.bus, 20),
    );
  }
  const unique = [];
  const seen = new Set();
  for (const s of stationRecords) {
    const key = `${s.cellIndex}:${s.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
    if (unique.length >= 120) break;
  }

  function tableFor(windowFilter) {
    const table = new Uint8Array(unique.length * cellCount);
    table.fill(UNREACHABLE);
    const wait = windowFilter === "weekday_am" ? 4 : windowFilter === "midday" ? 6 : 8;
    const stationPaths = unique.map((station) => walkAllFrom(station.cellIndex, nbrIndex, edgeMinutes, 30));
    for (let s = 0; s < unique.length; s++) {
      const fromStation = stationPaths[s];
      for (let c = 0; c < cellCount; c++) {
        const walkLeg = fromStation[c];
        if (!Number.isFinite(walkLeg) || walkLeg > 30) continue;
        const total = wait + walkLeg * 0.42;
        table[s * cellCount + c] = total > 254 ? UNREACHABLE : Math.ceil(total);
      }
    }
    return table;
  }

  return {
    stations: unique,
    weekday_am: tableFor("weekday_am"),
    midday: tableFor("midday"),
    weekend: tableFor("weekend"),
  };
}

function writeGraph(pathFile, nbrIndex, edgeMinutes) {
  const chunks = [];
  for (let i = 0; i < nbrIndex.length; i++) {
    const nbrs = nbrIndex[i];
    const weights = edgeMinutes[i];
    const row = Buffer.alloc(1 + nbrs.length * 4);
    row.writeUInt8(nbrs.length, 0);
    let o = 1;
    for (let k = 0; k < nbrs.length; k++) {
      row.writeUInt16LE(nbrs[k], o);
      o += 2;
      row.writeUInt16LE(Math.round(weights[k] * 1000), o);
      o += 2;
    }
    chunks.push(row);
  }
  fs.writeFileSync(pathFile, Buffer.concat(chunks));
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const cells = buildCells();
  const { nbrIndex, edgeMinutes } = buildGraph(cells);
  const gtfs = await tryGtfs();
  const overpass = gtfs ? null : await tryOverpassWalkMultiplier();
  const pt = buildPtTables(cells, nbrIndex, edgeMinutes, gtfs);
  fs.writeFileSync(path.join(outDir, "cells.json"), JSON.stringify(cells));
  writeGraph(path.join(outDir, "graph.bin"), nbrIndex, edgeMinutes);
  fs.writeFileSync(path.join(outDir, "stations.json"), JSON.stringify(pt.stations));
  fs.writeFileSync(path.join(outDir, "pt-weekday-am.bin"), pt.weekday_am);
  fs.writeFileSync(path.join(outDir, "pt-midday.bin"), pt.midday);
  fs.writeFileSync(path.join(outDir, "pt-weekend.bin"), pt.weekend);
  const manifest = {
    version: 1,
    h3Resolution: RES,
    walkSpeedKmh: WALK_KMH,
    waitPolicy:
      "Scheduled GTFS in-vehicle time plus average headway wait at origin stop (weekday AM 4 min, midday 6 min, weekend 8 min); real-time delays excluded.",
    exampleData: !gtfs,
    sources: {
      walking: {
        name: overpass
          ? "OpenStreetMap footways and local roads (Overpass)"
          : "H3 adjacency grid (geodesic edge lengths)",
        url: overpass ? "https://www.openstreetmap.org/copyright" : "https://h3geo.org/",
        retrieved: overpass?.retrieved ?? new Date().toISOString().slice(0, 10),
      },
      transit: {
        name: gtfs ? "PTV GTFS static feed" : "Illustrative station anchors",
        url: gtfs ? GTFS_URL : "https://opendata.transport.vic.gov.au/",
        retrieved: gtfs?.retrieved ?? new Date().toISOString().slice(0, 10),
      },
    },
    cellCount: cells.length,
    stationCount: pt.stations.length,
    profiles: ["weekday_am", "midday", "weekend"],
    files: {
      cells: "cells.json",
      graph: "graph.bin",
      stations: "stations.json",
      weekday_am: "pt-weekday-am.bin",
      midday: "pt-midday.bin",
      weekend: "pt-weekend.bin",
    },
  };
  fs.writeFileSync(path.join(outDir, "reach-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`reach cells=${cells.length} stations=${pt.stations.length} example=${manifest.exampleData}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
