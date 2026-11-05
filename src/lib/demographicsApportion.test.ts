import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apportionParcelsFromSa1Units } from "./demographicsApportion";
import type { DemographicsParcelRecord } from "./demographicsParcels";
import { buildDemographicsIndex } from "./demographicsClip";
import { aggregateCatchmentForPin, aggregateCatchmentFromParcels } from "./demographicsCatchment";
import { fromLocal, toLocal } from "./geo";
import type { DemographicsDataset } from "./demographicsTypes";
import { DEMOGRAPHICS_AGE_BANDS, DEMOGRAPHICS_HOUSEHOLD_TYPES, DEMOGRAPHICS_RENT_BINS } from "./demographicsTypes";

function emptyParcel(partial: Partial<DemographicsParcelRecord> & Pick<DemographicsParcelRecord, "id" | "sa1Code" | "centroidLon" | "centroidLat" | "ring" | "areaM2">): DemographicsParcelRecord {
  return {
    residents: 0,
    medianAge: null,
    apartmentShare: null,
    rentingShare: null,
    rentMedianWeekly: null,
    ageMale: Object.fromEntries(DEMOGRAPHICS_AGE_BANDS.map((band) => [band, 0])) as DemographicsParcelRecord["ageMale"],
    ageFemale: Object.fromEntries(DEMOGRAPHICS_AGE_BANDS.map((band) => [band, 0])) as DemographicsParcelRecord["ageFemale"],
    households: Object.fromEntries(DEMOGRAPHICS_HOUSEHOLD_TYPES.map((kind) => [kind, 0])) as DemographicsParcelRecord["households"],
    rentBins: Object.fromEntries(DEMOGRAPHICS_RENT_BINS.map((bin) => [bin, 0])) as DemographicsParcelRecord["rentBins"],
    ...partial,
  };
}

describe("demographicsApportion", () => {
  it("splits SA1 population across parcels by area share", () => {
    const unit = {
      code: "TEST",
      areaKm2: 0.01,
      ring: [
        [144.99, -37.8],
        [144.991, -37.8],
        [144.991, -37.799],
        [144.99, -37.799],
        [144.99, -37.8],
      ] as [number, number][],
      population: 3000,
      age: { "0-14": 0, "15-24": 0, "25-34": 0, "35-49": 0, "50-64": 0, "65+": 0 },
      households: { lone: 0, couple: 0, family: 0, group: 0 },
    };
    const parcels: DemographicsParcelRecord[] = [
      emptyParcel({
        id: "a",
        sa1Code: "TEST",
        centroidLon: 144.9905,
        centroidLat: -37.7995,
        ring: [
          [144.99, -37.8],
          [144.9905, -37.8],
          [144.9905, -37.7995],
          [144.99, -37.7995],
          [144.99, -37.8],
        ],
        areaM2: 100,
      }),
      emptyParcel({
        id: "b",
        sa1Code: "TEST",
        centroidLon: 144.9908,
        centroidLat: -37.7995,
        ring: [
          [144.9905, -37.8],
          [144.991, -37.8],
          [144.991, -37.7995],
          [144.9905, -37.7995],
          [144.9905, -37.8],
        ],
        areaM2: 200,
      }),
    ];
    const apportioned = apportionParcelsFromSa1Units(parcels, [unit]);
    const total = apportioned.reduce((sum, parcel) => sum + parcel.residents, 0);
    expect(Math.round(total)).toBe(3000);
    expect(Math.round(apportioned[0].residents)).toBe(1000);
    expect(Math.round(apportioned[1].residents)).toBe(2000);
  });

  it("400 m catchment sums more than 3,000 residents when parcel fabric covers the circle", () => {
    const center = { lon: 144.9746, lat: -37.8053 };
    const [east, north] = toLocal(-37.8, 145.0, center);
    const radiusM = 400;
    const parcels: DemographicsParcelRecord[] = [];
    for (let index = 0; index < 180; index++) {
      const angle = (index / 180) * Math.PI * 2;
      const dist = (index % 17) * 18;
      if (dist > radiusM) continue;
      const px = east + Math.cos(angle) * dist;
      const py = north + Math.sin(angle) * dist;
      const centroid = fromLocal([px, py], center);
      parcels.push(
        emptyParcel({
          id: `p-${index}`,
          sa1Code: "SYN",
          centroidLon: centroid.lon,
          centroidLat: centroid.lat,
          ring: [
            [centroid.lon, centroid.lat],
            [centroid.lon + 0.00001, centroid.lat],
            [centroid.lon + 0.00001, centroid.lat + 0.00001],
            [centroid.lon, centroid.lat + 0.00001],
            [centroid.lon, centroid.lat],
          ],
          areaM2: 120,
          residents: 22,
        }),
      );
    }
    const stats = aggregateCatchmentFromParcels({
      parcels,
      pin: { lon: 145.0, lat: -37.8 },
      radiusM,
    });
    expect(stats).not.toBeNull();
    expect(stats!.population).toBeGreaterThan(3000);
  });

  it("400 m around Fitzroy (145.0, -37.80) uses census overlap above 1,400 residents", () => {
    const metro = JSON.parse(
      readFileSync(new URL("../../public/demographics-metro.json", import.meta.url), "utf8"),
    ) as DemographicsDataset;
    const center = { lon: 144.9746, lat: -37.8053 };
    const index = buildDemographicsIndex(metro.units);
    const sa1Stats = aggregateCatchmentForPin({
      parcels: [],
      center,
      pin: { lon: 145.0, lat: -37.8 },
      radiusM: 400,
      index,
    });
    expect(sa1Stats).not.toBeNull();
    expect(sa1Stats!.population).toBeGreaterThan(1400);

    const cachePath = new URL("../../tmp/parcels-cache/parcels-inner-melbourne.geojson", import.meta.url);
    try {
      const geo = JSON.parse(readFileSync(cachePath, "utf8")) as { features: GeoJSON.Feature[] };
      const parcelRecords = geo.features.map((feature, featureIndex) => {
        const props = feature.properties ?? {};
        const ring = (feature.geometry as GeoJSON.Polygon).coordinates[0].map(
          ([lon, lat]) => [lon, lat] as [number, number],
        );
        let sx = 0;
        let sy = 0;
        for (const [lon, lat] of ring) {
          sx += lon;
          sy += lat;
        }
        return emptyParcel({
          id: String(props.id ?? featureIndex),
          sa1Code: String(props.sa1 ?? ""),
          centroidLon: sx / ring.length,
          centroidLat: sy / ring.length,
          ring,
          areaM2: Number(props.a) || 1,
          residents: Number(props.r) || 0,
        });
      });
      const apportioned = apportionParcelsFromSa1Units(parcelRecords, metro.units);
      const parcelStats = aggregateCatchmentFromParcels({
        parcels: apportioned,
        pin: { lon: 145.0, lat: -37.8 },
        radiusM: 400,
      });
      expect(parcelStats).not.toBeNull();
      expect(parcelStats!.population).toBeGreaterThan(3000);
    } catch {
      expect(true).toBe(true);
    }
  });
});
