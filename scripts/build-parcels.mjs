import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const INNER = { west: 144.95, south: -37.81, east: 145.0, north: -37.78 };
const WFS = "https://opendata.maps.vic.gov.au/geoserver/ows";
const TYPE = "open-data-platform:v_parcel_mp";
const CACHE = "tmp/parcels-cache";
const OUT = "public";
const GRID = 4;

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringAreaM2(ring, latRef) {
  const mPerDegLon = 111_320 * Math.cos((latRef * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    const x1 = lon1 * mPerDegLon;
    const y1 = lat1 * 111_132;
    const x2 = lon2 * mPerDegLon;
    const y2 = lat2 * 111_132;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

function ringCentroid(ring) {
  let sx = 0;
  let sy = 0;
  for (const [lon, lat] of ring) {
    sx += lon;
    sy += lat;
  }
  return [sx / ring.length, sy / ring.length];
}

function simplifyRing(ring, maxPoints = 12) {
  if (ring.length <= maxPoints) return ring;
  const step = Math.ceil(ring.length / maxPoints);
  const out = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
  return out;
}

async function fetchTile(bbox) {
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: TYPE,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north},EPSG:4326`,
    count: "50000",
  });
  const response = await fetch(`${WFS}?${params}`);
  if (!response.ok) throw new Error(`WFS ${response.status}`);
  return response.json();
}

function gridTiles() {
  const tiles = [];
  const dLon = (INNER.east - INNER.west) / GRID;
  const dLat = (INNER.north - INNER.south) / GRID;
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      tiles.push({
        west: INNER.west + col * dLon,
        east: INNER.west + (col + 1) * dLon,
        south: INNER.south + row * dLat,
        north: INNER.south + (row + 1) * dLat,
      });
    }
  }
  return tiles;
}

function sa1ForPoint(units, lon, lat) {
  for (const unit of units) {
    if (pointInRing(lon, lat, unit.ring)) return unit;
  }
  return null;
}

function apportionParcel(unit, areaM2) {
  const sa1M2 = unit.areaKm2 * 1_000_000;
  const share = sa1M2 > 0 ? Math.min(1, areaM2 / sa1M2) : 0;
  const residents = unit.population * share;
  const scale = share;
  const ageMale = {};
  const ageFemale = {};
  for (const band of Object.keys(unit.age)) {
    ageMale[band] = (unit.ageMale?.[band] ?? unit.age[band] * 0.49) * scale;
    ageFemale[band] = (unit.ageFemale?.[band] ?? unit.age[band] * 0.51) * scale;
  }
  const households = {};
  for (const kind of Object.keys(unit.households)) {
    households[kind] = unit.households[kind] * scale;
  }
  const rentBins = {};
  for (const bin of Object.keys(unit.rentBins ?? {})) {
    rentBins[bin] = (unit.rentBins[bin] ?? 0) * scale;
  }
  return {
    residents,
    medianAge: unit.medianAge ?? null,
    apartmentShare: unit.apartmentShare ?? null,
    rentingShare: unit.rentingShare ?? null,
    rentMedianWeekly: unit.rentMedianWeekly ?? null,
    ageMale,
    ageFemale,
    households,
    rentBins,
  };
}

function runTippecanoe(input, output) {
  const tippecanoe = process.env.TIPPECANOE || "tippecanoe";
  const args = [
    "-o",
    output,
    "-l",
    "parcels",
    "--force",
    "--no-tile-compression",
    "-z14",
    "-Z10",
    "--drop-densest-as-needed",
    "--coalesce-densest-as-needed",
    input,
  ];
  const result = spawnSync(tippecanoe, args, { stdio: "inherit" });
  if (result.status !== 0) throw new Error("tippecanoe failed");
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const metro = JSON.parse(readFileSync(`${OUT}/demographics-metro.json`, "utf8"));
  const units = metro.units;

  const features = [];
  const compact = [];
  const seen = new Set();
  for (const tile of gridTiles()) {
    const page = await fetchTile(tile);
    const batch = page.features ?? [];
    for (const feature of batch) {
      const geom = feature.geometry;
      if (!geom) continue;
      const rings =
        geom.type === "Polygon"
          ? [geom.coordinates[0]]
          : geom.type === "MultiPolygon"
            ? geom.coordinates.map((poly) => poly[0])
            : [];
      for (const ring of rings) {
        if (!ring?.length) continue;
        const simplified = simplifyRing(ring.map(([lon, lat]) => [lon, lat]));
        const [clon, clat] = ringCentroid(simplified);
        const sa1 = sa1ForPoint(units, clon, clat);
        if (!sa1) continue;
        const areaM2 = ringAreaM2(simplified, clat);
        if (areaM2 < 8) continue;
        const stats = apportionParcel(sa1, areaM2);
        if (stats.residents <= 0.05) continue;
        const id = String(feature.properties?.parcel_pfi ?? feature.id ?? `${clon.toFixed(5)}_${clat.toFixed(5)}`);
        if (seen.has(id)) continue;
        seen.add(id);
        compact.push({
          id,
          sa1Code: sa1.code,
          centroidLon: clon,
          centroidLat: clat,
          ring: simplified,
          areaM2,
          ...stats,
        });
        features.push({
          type: "Feature",
          properties: { id, residents: stats.residents, sa1: sa1.code },
          geometry: { type: "Polygon", coordinates: [simplified] },
        });
      }
    }
    console.log(JSON.stringify({ tile, fetched: batch.length, total: compact.length }));
  }

  const geojsonPath = `${CACHE}/parcels-inner-melbourne.geojson`;
  writeFileSync(geojsonPath, JSON.stringify({ type: "FeatureCollection", features }));
  const compactPath = `${OUT}/demographics-parcels.json`;
  writeFileSync(
    compactPath,
    JSON.stringify({
      version: 1,
      bbox: INNER,
      parcelCount: compact.length,
      parcels: compact,
    }),
  );
  const pmtilesPath = `${OUT}/demographics-parcels.pmtiles`;
  runTippecanoe(geojsonPath, pmtilesPath);
  writeFileSync(
    `${OUT}/demographics-parcels-manifest.json`,
    JSON.stringify({
      version: 1,
      bbox: INNER,
      parcelCount: compact.length,
      compactUrl: "demographics-parcels.json",
      pmtilesUrl: "demographics-parcels.pmtiles",
      builtAt: new Date().toISOString(),
      source: "Vicmap Property v_parcel_mp WFS",
      licence: "CC BY 4.0",
      attribution: "Parcels © State of Victoria (DTP), Vicmap Property, CC BY 4.0",
    }),
  );
  console.log(
    JSON.stringify({
      parcels: compact.length,
      compactBytes: readFileSync(compactPath).length,
      pmtilesBytes: readFileSync(pmtilesPath).length,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
