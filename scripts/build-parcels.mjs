import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const INNER = { west: 144.94, south: -37.82, east: 145.01, north: -37.77 };
const WFS = "https://opendata.maps.vic.gov.au/geoserver/ows";
const TYPE = "open-data-platform:v_parcel_mp";
const CACHE = "tmp/parcels-cache";
const OUT = "public";
const GRID = 5;

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

function simplifyRing(ring, maxPoints = 24) {
  if (ring.length <= maxPoints) return ring;
  const step = Math.ceil(ring.length / maxPoints);
  const out = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
  if (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]) {
    out.push(out[0]);
  }
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

function apportionGroup(unit, group) {
  const totalArea = group.reduce((sum, parcel) => sum + parcel.areaM2, 0);
  if (totalArea <= 0) return group;
  return group.map((parcel) => {
    const share = parcel.areaM2 / totalArea;
    return {
      ...parcel,
      residents: unit.population * share,
    };
  });
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
    "--no-feature-limit",
    "--no-tile-size-limit",
    "--extend-zooms-if-still-dropping",
    "-z15",
    "-Z11",
    "--simplification=3",
    "--detect-shared-borders",
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

  const raw = [];
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
        const coords = ring.map(([lon, lat]) => [lon, lat]);
        const simplified = simplifyRing(coords);
        const [clon, clat] = ringCentroid(simplified);
        const sa1 = sa1ForPoint(units, clon, clat);
        if (!sa1) continue;
        const areaM2 = ringAreaM2(simplified, clat);
        if (areaM2 < 4) continue;
        const id = String(feature.properties?.parcel_pfi ?? feature.id ?? `${clon.toFixed(5)}_${clat.toFixed(5)}`);
        if (seen.has(id)) continue;
        seen.add(id);
        raw.push({
          id,
          sa1Code: sa1.code,
          sa1Unit: sa1,
          centroidLon: clon,
          centroidLat: clat,
          ring: simplified,
          areaM2,
        });
      }
    }
    console.log(JSON.stringify({ tile, fetched: batch.length, total: raw.length }));
  }

  const bySa1 = new Map();
  for (const parcel of raw) {
    const group = bySa1.get(parcel.sa1Code) ?? [];
    group.push(parcel);
    bySa1.set(parcel.sa1Code, group);
  }

  const compact = [];
  for (const group of bySa1.values()) {
    const unit = group[0].sa1Unit;
    const apportioned = apportionGroup(unit, group);
    for (const parcel of apportioned) {
      compact.push({
        id: parcel.id,
        sa1Code: parcel.sa1Code,
        centroidLon: parcel.centroidLon,
        centroidLat: parcel.centroidLat,
        ring: parcel.ring,
        areaM2: parcel.areaM2,
        residents: parcel.residents,
      });
    }
  }

  const features = compact.map((parcel) => ({
    type: "Feature",
    properties: {
      id: parcel.id,
      sa1: parcel.sa1Code,
      r: Math.round(parcel.residents * 1000) / 1000,
      a: Math.round(parcel.areaM2),
    },
    geometry: { type: "Polygon", coordinates: [parcel.ring] },
  }));

  const geojsonPath = `${CACHE}/parcels-inner-melbourne.geojson`;
  writeFileSync(geojsonPath, JSON.stringify({ type: "FeatureCollection", features }));
  const pmtilesPath = `${OUT}/demographics-parcels.pmtiles`;
  runTippecanoe(geojsonPath, pmtilesPath);
  writeFileSync(
    `${OUT}/demographics-parcels-manifest.json`,
    JSON.stringify({
      version: 1,
      bbox: INNER,
      parcelCount: compact.length,
      pmtilesUrl: "demographics-parcels.pmtiles",
      delivery: "pmtiles",
      builtAt: new Date().toISOString(),
      source: "Vicmap Property v_parcel_mp WFS",
      licence: "CC BY 4.0",
      attribution: "Parcels © State of Victoria (DTP), Vicmap Property, CC BY 4.0",
    }),
  );
  console.log(
    JSON.stringify({
      parcels: compact.length,
      pmtilesBytes: readFileSync(pmtilesPath).length,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
