import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { cellToLatLng, latLngToCell, gridDisk, greatCircleDistance } from "h3-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "reach");
const cacheDir = path.join(outDir, "_cache");

const CBD = { lat: -37.8136, lon: 144.9631 };
const RADIUS_KM = 12;
const RES = 10;
const WALK_KMH = 4.8;
const WALK_MPM = (WALK_KMH * 1000) / 60;
const UNREACHABLE = 255;
const TRANSFER_PENALTY_MIN = 3;

const GTFS_URL = "https://data.ptv.vic.gov.au/downloads/gtfs.zip";
const GEofabrik_URL = "https://download.geofabrik.de/australia-oceania/australia/victoria-latest.osm.pbf";

function kmBetween(aLat, aLon, bLat, bLon) {
  return greatCircleDistance([aLat, aLon], [bLat, bLon], "km");
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
  if (lines.length === 0) return [];
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

function gtfsMinutes(timeStr) {
  const parts = timeStr.split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  const s = Number.parseFloat(parts[2] ?? "0");
  return h * 60 + m + s / 60;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

function buildCells() {
  const center = latLngToCell(CBD.lat, CBD.lon, RES);
  const cells = new Set();
  for (let k = 0; k <= 105; k++) {
    for (const h of gridDisk(center, k)) {
      const [lat, lon] = cellToLatLng(h);
      if (kmBetween(lat, lon, CBD.lat, CBD.lon) <= RADIUS_KM) cells.add(h);
    }
  }
  return [...cells];
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

async function ensureGtfsExtracted() {
  const zipPath = path.join(outDir, "gtfs.zip");
  const extractDir = path.join(outDir, "gtfs");
  fs.mkdirSync(extractDir, { recursive: true });
  if (!fs.existsSync(zipPath)) {
    console.log("Downloading PTV GTFS…");
    await download(GTFS_URL, zipPath);
  }
  const regionMarker = path.join(extractDir, "1", "google_transit.zip");
  if (!fs.existsSync(regionMarker)) {
    execFileSync("unzip", ["-qo", zipPath, "-d", extractDir], { stdio: "inherit" });
  }
  return extractDir;
}

function regionExtractDirs(extractDir) {
  return fs
    .readdirSync(extractDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const regionId = d.name;
      const regionZip = path.join(extractDir, regionId, "google_transit.zip");
      const regionDir = path.join(extractDir, regionId, "extract");
      if (!fs.existsSync(regionZip)) return null;
      fs.mkdirSync(regionDir, { recursive: true });
      if (!fs.existsSync(path.join(regionDir, "stops.txt"))) {
        execFileSync("unzip", ["-qo", regionZip, "-d", regionDir], { stdio: "pipe" });
      }
      return regionDir;
    })
    .filter(Boolean);
}

function activeServicesForProfile(calendarRows, profile) {
  const active = new Set();
  for (const row of calendarRows) {
    const start = row.start_date;
    const end = row.end_date;
    if (start > "20261231" || end < "20240101") continue;
    const weekday =
      row.monday === "1" ||
      row.tuesday === "1" ||
      row.wednesday === "1" ||
      row.thursday === "1" ||
      row.friday === "1";
    const saturday = row.saturday === "1";
    const sunday = row.sunday === "1";
    if (profile === "weekend") {
      if (saturday || sunday) active.add(row.service_id);
    } else if (weekday) {
      active.add(row.service_id);
    }
  }
  return active;
}

function tripInPeriod(firstDepartureMin, profile) {
  if (profile === "weekday_am") return firstDepartureMin >= 7 * 60 && firstDepartureMin < 10 * 60;
  if (profile === "midday") return firstDepartureMin >= 11 * 60 && firstDepartureMin < 14 * 60;
  return firstDepartureMin >= 10 * 60 && firstDepartureMin < 18 * 60;
}

function stopMode(parent, routeType, name) {
  if (parent.includes(":rail:") || routeType === 0) return "train";
  if (routeType === 1 || /tram/i.test(name)) return "tram";
  return "bus";
}

function loadMetroStops(regionDirs, cells) {
  const byId = new Map();
  for (const regionDir of regionDirs) {
    const stopsPath = path.join(regionDir, "stops.txt");
    if (!fs.existsSync(stopsPath)) continue;
    const routes = parseCsv(fs.readFileSync(path.join(regionDir, "routes.txt"), "utf8"));
    const routeType = new Map(routes.map((r) => [r.route_id, Number.parseInt(r.route_type, 10)]));
    for (const row of parseCsv(fs.readFileSync(stopsPath, "utf8"))) {
      const lat = Number.parseFloat(row.stop_lat);
      const lon = Number.parseFloat(row.stop_lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (kmBetween(lat, lon, CBD.lat, CBD.lon) > RADIUS_KM + 1) continue;
      const stopId = row.stop_id;
      if (byId.has(stopId)) continue;
      byId.set(stopId, {
        stopId,
        name: row.stop_name,
        lat,
        lon,
        parent: row.parent_station ?? "",
        cellIndex: nearestCellIndex(cells, lat, lon),
        routeTypeHint: 3,
      });
    }
    void routeType;
  }
  return [...byId.values()];
}

async function streamStopTimesTripFirstDeps(regionDir, activeServices) {
  const trips = parseCsv(fs.readFileSync(path.join(regionDir, "trips.txt"), "utf8"));
  const activeTrips = new Set();
  for (const row of trips) {
    if (activeServices.has(row.service_id)) activeTrips.add(row.trip_id);
  }
  const firstDep = new Map();
  const rl = createInterface({ input: createReadStream(path.join(regionDir, "stop_times.txt"), "utf8") });
  let headers = null;
  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line).map((h) => h.trim());
      continue;
    }
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i]?.trim() ?? "";
    });
    if (!activeTrips.has(row.trip_id)) continue;
    const seq = Number.parseInt(row.stop_sequence, 10);
    if (seq !== 1) continue;
    const dep = gtfsMinutes(row.departure_time || row.arrival_time);
    const prev = firstDep.get(row.trip_id);
    if (prev === undefined || dep < prev) firstDep.set(row.trip_id, dep);
  }
  return { activeTrips, firstDep };
}

async function addIvFromRegion(regionDir, profile, stopIdToIndex, iv, stopCount, activeServices) {
  const { activeTrips, firstDep } = await streamStopTimesTripFirstDeps(regionDir, activeServices);
  const periodTrips = new Set();
  for (const tripId of activeTrips) {
    const dep = firstDep.get(tripId);
    if (dep !== undefined && tripInPeriod(dep, profile)) periodTrips.add(tripId);
  }
  if (periodTrips.size === 0) return;
  const rl = createInterface({ input: createReadStream(path.join(regionDir, "stop_times.txt"), "utf8") });
  let headers = null;
  let currentTrip = null;
  let prevStop = null;
  let prevDep = null;
  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line).map((h) => h.trim());
      continue;
    }
    const cols = parseCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i]?.trim() ?? "";
    });
    if (!periodTrips.has(row.trip_id)) continue;
    if (row.trip_id !== currentTrip) {
      currentTrip = row.trip_id;
      prevStop = null;
      prevDep = null;
    }
    const stopIdx = stopIdToIndex.get(row.stop_id);
    if (stopIdx === undefined) continue;
    const arr = gtfsMinutes(row.arrival_time || row.departure_time);
    const dep = gtfsMinutes(row.departure_time || row.arrival_time);
    if (prevStop !== null && prevDep !== null) {
      const minutes = Math.max(0.5, arr - prevDep);
      const offset = prevStop * stopCount + stopIdx;
      if (minutes < iv[offset]) iv[offset] = minutes;
    }
    prevStop = stopIdx;
    prevDep = dep;
  }
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

function readGraph(graphPath, cellCount) {
  const buf = fs.readFileSync(graphPath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let o = 0;
  const nbrIndex = [];
  const edgeMinutes = [];
  for (let i = 0; i < cellCount; i++) {
    const count = view.getUint8(o);
    o += 1;
    const nbrs = [];
    const weights = [];
    for (let k = 0; k < count; k++) {
      nbrs.push(view.getUint16(o, true));
      o += 2;
      weights.push(view.getUint16(o, true) / 1000);
      o += 2;
    }
    nbrIndex.push(nbrs);
    edgeMinutes.push(weights);
  }
  return { nbrIndex, edgeMinutes };
}


function buildWalkGraphOsm(cells) {
  fs.writeFileSync(path.join(outDir, "cells.json"), JSON.stringify(cells));
  console.log("Building OSM walk graph (OSMnx / Geofabrik Victoria)…");
  execFileSync("python3", [path.join(root, "pipeline", "build_reach_walk.py"), outDir], {
    stdio: "inherit",
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const cells = buildCells();
  buildWalkGraphOsm(cells);
  readGraph(path.join(outDir, "graph.bin"), cells.length);
  const extractDir = await ensureGtfsExtracted();
  const regionDirs = regionExtractDirs(extractDir);
  const stops = loadMetroStops(regionDirs, cells);
  if (stops.length < 1000) {
    throw new Error(`Expected >1000 metro stops, got ${stops.length}`);
  }
  const stopIdToIndex = new Map(stops.map((s, i) => [s.stopId, i]));
  const stopCount = stops.length;
  const cellCount = cells.length;
  const profiles = ["weekday_am", "midday", "weekend"];
  const ptFiles = {
    weekday_am: "pt-weekday-am.bin",
    midday: "pt-midday.bin",
    weekend: "pt-weekend.bin",
  };
  for (const profile of profiles) {
    console.log(`Building GTFS in-vehicle matrix for ${profile}…`);
    const iv = new Float32Array(stopCount * stopCount).fill(UNREACHABLE);
    for (const regionDir of regionDirs) {
      const calendarPath = path.join(regionDir, "calendar.txt");
      if (!fs.existsSync(calendarPath)) continue;
      const activeServices = activeServicesForProfile(parseCsv(fs.readFileSync(calendarPath, "utf8")), profile);
      await addIvFromRegion(regionDir, profile, stopIdToIndex, iv, stopCount, activeServices);
    }
    fs.writeFileSync(path.join(outDir, `iv-${profile}.bin`), Buffer.from(iv.buffer));
  }
  const stationJson = stops.map((s) => ({
    name: s.name,
    cellIndex: s.cellIndex,
    modes: [stopMode(s.parent, s.routeTypeHint, s.name)],
  }));
  fs.writeFileSync(path.join(outDir, "stations.json"), JSON.stringify(stationJson));
  fs.writeFileSync(path.join(outDir, "stations-build.json"), JSON.stringify(stationJson));
  fs.writeFileSync(
    path.join(outDir, "pt-build-meta.json"),
    JSON.stringify({ stopCount, cellCount, profiles }),
  );
  console.log("Building PT reach tables (scipy shortest paths + OSM walk)…");
  execFileSync("python3", [path.join(root, "pipeline", "build_reach_pt.py"), outDir], { stdio: "inherit" });
  for (const fileName of Object.values(ptFiles)) {
    const rawPath = path.join(outDir, fileName);
    execFileSync("gzip", ["-9", "-kf", rawPath], { stdio: "inherit" });
    fs.rmSync(rawPath, { force: true });
  }
  const ptFilesOut = {
    weekday_am: "pt-weekday-am.bin.gz",
    midday: "pt-midday.bin.gz",
    weekend: "pt-weekend.bin.gz",
  };
  const walkMeta = JSON.parse(fs.readFileSync(path.join(outDir, "walk-build-meta.json"), "utf8"));
  const retrieved = new Date().toISOString().slice(0, 10);
  const manifest = {
    version: 2,
    h3Resolution: RES,
    walkSpeedKmh: WALK_KMH,
    waitPolicy:
      "Average scheduled wait at boarding stop (weekday AM 4 min, midday 6 min, weekend 8 min) plus GTFS in-vehicle times and one transfer penalty (3 min); real-time delays excluded.",
    exampleData: false,
    sources: {
      walking: {
        name: walkMeta.source,
        url: walkMeta.url,
        retrieved,
      },
      transit: {
        name: "PTV GTFS static feed (all metro regions)",
        url: GTFS_URL,
        retrieved,
      },
    },
    cellCount,
    stationCount: stops.length,
    profiles,
    files: {
      cells: "cells.json",
      graph: "graph.bin",
      stations: "stations.json",
      weekday_am: ptFilesOut.weekday_am,
      midday: ptFilesOut.midday,
      weekend: ptFilesOut.weekend,
    },
  };
  fs.writeFileSync(path.join(outDir, "reach-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`reach cells=${cellCount} stops=${stops.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
