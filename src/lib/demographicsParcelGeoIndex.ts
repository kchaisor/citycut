import RBush from "rbush";
import { haversineDistanceM } from "./haversine";
import { M_PER_DEG_LAT, mPerDegLon } from "./geo";
import type { LonLat } from "../types";
import type { DemographicsParcelRecord } from "./demographicsParcels";

type GeoParcel = DemographicsParcelRecord & {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export type DemographicsParcelGeoIndex = RBush<GeoParcel>;

function parcelLonLatBounds(parcel: DemographicsParcelRecord) {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of parcel.ring) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLon)) {
    return {
      minLon: parcel.centroidLon,
      minLat: parcel.centroidLat,
      maxLon: parcel.centroidLon,
      maxLat: parcel.centroidLat,
    };
  }
  return { minLon, minLat, maxLon, maxLat };
}

export function buildParcelGeoIndex(parcels: DemographicsParcelRecord[]): DemographicsParcelGeoIndex {
  const tree = new RBush<GeoParcel>();
  tree.load(
    parcels.map((parcel) => {
      const bounds = parcelLonLatBounds(parcel);
      return {
        ...parcel,
        minX: bounds.minLon,
        minY: bounds.minLat,
        maxX: bounds.maxLon,
        maxY: bounds.maxLat,
        minLon: bounds.minLon,
        minLat: bounds.minLat,
        maxLon: bounds.maxLon,
        maxLat: bounds.maxLat,
      };
    }),
  );
  return tree;
}

export function searchParcelsNearPin(
  index: DemographicsParcelGeoIndex,
  pin: LonLat,
  radiusM: number,
): DemographicsParcelRecord[] {
  const padLon = radiusM / mPerDegLon(pin.lat);
  const padLat = radiusM / M_PER_DEG_LAT;
  const candidates = index.search({
    minX: pin.lon - padLon,
    minY: pin.lat - padLat,
    maxX: pin.lon + padLon,
    maxY: pin.lat + padLat,
  });
  const out: DemographicsParcelRecord[] = [];
  for (const parcel of candidates) {
    const centroid: LonLat = { lon: parcel.centroidLon, lat: parcel.centroidLat };
    if (haversineDistanceM(centroid, pin) <= radiusM) out.push(parcel);
  }
  return out;
}

export function parcelCentroidInsideCatchment(
  parcel: DemographicsParcelRecord,
  pin: LonLat,
  radiusM: number,
): boolean {
  return haversineDistanceM({ lon: parcel.centroidLon, lat: parcel.centroidLat }, pin) <= radiusM;
}
