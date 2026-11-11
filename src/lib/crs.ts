import proj4 from "proj4";
import { fromLocal, toLocal } from "./geo";
import type { LonLat, Pt } from "../types";

export { CRS_NOTE, mgaCrs, mgaZone, type MgaCrs } from "./crsZone";

const converters = new Map<number, proj4.Converter>();

function projString(zone: number): string {
  const centralMeridian = zone * 6 - 183;
  return `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=0.9996 +x_0=500000 +y_0=10000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs`;
}

function converterFor(zone: number): proj4.Converter {
  const cached = converters.get(zone);
  if (cached) return cached;
  const id = `GDA2020_MGA_${zone}`;
  proj4.defs(id, projString(zone));
  const converter = proj4("EPSG:4326", id);
  converters.set(zone, converter);
  return converter;
}

export function projectLonLat(lon: number, lat: number, zone: number): [number, number] {
  const projected = converterFor(zone).forward([lon, lat]);
  return [projected[0], projected[1]];
}

/**
 * Local east/north metres (the CityModel frame) back to MGA.
 * The whole block stays in one zone, the zone of the cut centre, so a block
 * that straddles a zone boundary does not tear.
 */
export function projectLocal(point: Pt, origin: LonLat, zone: number): [number, number] {
  const geographic = fromLocal(point, origin);
  return projectLonLat(geographic.lon, geographic.lat, zone);
}

export function unprojectMga(easting: number, northing: number, zone: number): { lon: number; lat: number } {
  const [lon, lat] = converterFor(zone).inverse([easting, northing]);
  return { lon, lat };
}

export function mgaToLocal(easting: number, northing: number, origin: LonLat, zone: number): Pt {
  const { lon, lat } = unprojectMga(easting, northing, zone);
  return toLocal(lat, lon, origin);
}
