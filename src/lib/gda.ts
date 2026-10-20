/**
 * GDA94 → GDA2020, the ICSM 7-parameter similarity transformation (EPSG:8048,
 * "GDA94 to GDA2020 (1)", coordinate-frame rotation), on the GRS80 ellipsoid.
 *
 * Used for NSW sources that are stored in GDA94 and whose servers do not transform on request
 * (DPHI EPI Primary Planning Layers, City of Sydney contours). NSW Spatial Services layers are
 * read from the *_multiCRS services with outSR=7844 instead, which apply the official
 * conformal + distortion NTv2 grid (EPSG:8446) server-side. At Pyrmont the two agree to 34 mm.
 *
 * GDA2020 is then treated as WGS84 for Overture/OSM, which in Sydney are traced against
 * GDA2020-registered imagery; plate motion since 2020 (~7 cm/yr) is not applied.
 */

const A = 6378137;
const F = 1 / 298.257222101;
const E2 = F * (2 - F);
const ARCSEC = Math.PI / (180 * 3600);

// EPSG:8048 parameters (metres, arc-seconds, ppm).
const TX = 0.06155;
const TY = -0.01087;
const TZ = -0.04019;
const RX = -0.0394924 * ARCSEC;
const RY = -0.0327221 * ARCSEC;
const RZ = -0.0328979 * ARCSEC;
const DS = -0.009994e-6;

function toCartesian(lonDeg: number, latDeg: number, h = 0): [number, number, number] {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const sin = Math.sin(lat);
  const n = A / Math.sqrt(1 - E2 * sin * sin);
  return [(n + h) * Math.cos(lat) * Math.cos(lon), (n + h) * Math.cos(lat) * Math.sin(lon), (n * (1 - E2) + h) * sin];
}

function toGeodetic(x: number, y: number, z: number): [number, number] {
  const lon = Math.atan2(y, x);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  for (let i = 0; i < 6; i += 1) {
    const sin = Math.sin(lat);
    const n = A / Math.sqrt(1 - E2 * sin * sin);
    const h = p / Math.cos(lat) - n;
    lat = Math.atan2(z, p * (1 - (E2 * n) / (n + h)));
  }
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** One GDA94 lon/lat (degrees) → GDA2020 lon/lat. Ellipsoidal height is held at 0 and dropped. */
export function gda94ToGda2020(lon: number, lat: number): [number, number] {
  const [x, y, z] = toCartesian(lon, lat);
  const s = 1 + DS;
  // Coordinate-frame convention: X' = T + s · R · X with R = [[1, rz, -ry], [-rz, 1, rx], [ry, -rx, 1]].
  const x2 = TX + s * (x + RZ * y - RY * z);
  const y2 = TY + s * (-RZ * x + y + RX * z);
  const z2 = TZ + s * (RY * x - RX * y + z);
  return toGeodetic(x2, y2, z2);
}
