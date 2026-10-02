import { describe, expect, it } from "vitest";
import { signedArea, toLocal } from "./geo";
import type { LonLat, Pt } from "../types";
import { buildOverpassQuery, fetchOverpass, overpassBBox, type OverpassElement } from "./overpass";
import { isOpenWaterArea } from "./waterAreas";
import { parseCity } from "./parseOsm";
import { writeFileSync } from "node:fs";

function bbox(center: { lat: number; lon: number }, sideM: number) {
  const half = sideM / 2;
  const dLat = half / 111320;
  const dLon = half / (111320 * Math.cos((center.lat * Math.PI) / 180));
  return overpassBBox({
    south: center.lat - dLat,
    west: center.lon - dLon,
    north: center.lat + dLat,
    east: center.lon + dLon,
  });
}

function isWaterCandidate(tags: Record<string, string>): boolean {
  return Boolean(
    tags.natural === "water" ||
      tags.waterway ||
      tags.landuse === "reservoir" ||
      tags.water ||
      (tags.natural === "wetland" && tags.water),
  );
}

function tagsSummary(tags: Record<string, string>): string {
  const keys = [
    "natural",
    "water",
    "waterway",
    "landuse",
    "man_made",
    "intermittent",
    "seasonal",
    "name",
  ];
  const parts: string[] = [];
  for (const k of keys) {
    if (tags[k]) parts.push(`${k}=${tags[k]}`);
  }
  return parts.join("; ") || "(no tags)";
}

function ringAreaM2(el: OverpassElement, origin: LonLat): number | null {
  const geom = el.geometry;
  if (!geom || geom.length < 3) return null;
  const ring: Pt[] = geom.map((g) => toLocal(g.lat, g.lon, origin));
  if (ring.length < 4) return null;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.5) return null;
  return Math.round(Math.abs(signedArea(ring)));
}

function waterRows(
  site: string,
  center: LonLat,
  sideM: number,
  elements: OverpassElement[],
) {
  const parsed = parseCity({ elements }, center, sideM, {
    buildings: false,
    roads: false,
    waterGreen: true,
    trees: false,
  });
  const modelWater = new Map(
    parsed.areas.filter((a) => a.kind === "water").map((a) => [a.id, Math.round(Math.abs(signedArea(a.ring)))]),
  );
  const seen = new Set<number>();
  const rows: {
    site: string;
    osmId: string;
    tags: string;
    areaM2: number | null;
    status: "kept" | "hidden";
  }[] = [];

  for (const el of elements) {
    if (el.type !== "way" && el.type !== "relation") continue;
    const tags = el.tags ?? {};
    if (!isWaterCandidate(tags)) continue;
    if (seen.has(el.id)) continue;
    seen.add(el.id);
    const areaM2 = modelWater.get(el.id) ?? ringAreaM2(el, center);
    const kept = isOpenWaterArea(tags, areaM2 ?? undefined);
    rows.push({
      site,
      osmId: `${el.type}/${el.id}`,
      tags: tagsSummary(tags),
      areaM2,
      status: kept ? "kept" : "hidden",
    });
  }
  rows.sort((a, b) => (b.areaM2 ?? 0) - (a.areaM2 ?? 0));
  return rows;
}

describe.runIf(process.env.WATER_INVENTORY === "1")("water OSM inventory (manual)", () => {
  it(
    "writes Carlton Gardens and Albert Park Lake water tables",
    async () => {
      const sites = [
        { name: "Carlton Gardens", lat: -37.8047, lon: 144.9712 },
        { name: "Albert Park Lake", lat: -37.846, lon: 144.971 },
      ] as const;
      const sideM = 1000;
      const allRows = [];
      for (const site of sites) {
        const center = { lat: site.lat, lon: site.lon };
        const q = buildOverpassQuery(bbox(center, sideM), {
          buildings: false,
          roads: false,
          waterGreen: true,
          trees: false,
        });
        const data = await fetchOverpass(q);
        allRows.push(...waterRows(site.name, { lat: site.lat, lon: site.lon }, sideM, data.elements));
      }
      expect(allRows.length).toBeGreaterThan(0);
      writeFileSync("/opt/cursor/artifacts/water-inventory.json", JSON.stringify(allRows, null, 2));
    },
    120_000,
  );
});
