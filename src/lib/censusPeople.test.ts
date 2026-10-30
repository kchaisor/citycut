import { describe, expect, it } from "vitest";
import {
  CENSUS_ATTRIBUTION,
  CENSUS_FIELDS,
  aggregateSa1s,
  candidateSa2Codes,
  decodeRing,
  hundredPeople,
  loadCensusForSite,
  parentSa2Code,
  selectSa1s,
  share,
  toValues,
  type CensusChunk,
  type CensusIndex,
} from "./censusPeople";

const SCALE = 1e5;
const CENTER = { lat: -37.8, lon: 144.98 };

function encode(ring: [number, number][]): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * SCALE);
    const y = Math.round(lat * SCALE);
    out.push(x - px, y - py);
    px = x;
    py = y;
  }
  return out;
}

function box(west: number, south: number, east: number, north: number): number[][][] {
  return [[encode([[west, south], [east, south], [east, north], [west, north], [west, south]])]];
}

function raw(overrides: Partial<Record<(typeof CENSUS_FIELDS)[number], number>>): number[] {
  return CENSUS_FIELDS.map((field) => overrides[field] ?? 0);
}

const chunkA: CensusChunk = {
  code: "206071142",
  name: "Fitzroy",
  sa2: raw({ pop: 10000, medAge: 33 }),
  sa1: [
    { code: "20607114201", areaKm2: 1, values: raw({ pop: 400, medAge: 30, medHhInc: 2000, tenRent: 100 }), geometry: box(144.97, -37.81, 144.99, -37.79) },
    { code: "20607114202", areaKm2: 1, values: raw({ pop: 999, medAge: 60 }), geometry: box(145.1, -37.9, 145.11, -37.89) },
  ],
};

const chunkB: CensusChunk = {
  code: "206071143",
  name: "Next door",
  sa2: raw({ pop: 5000 }),
  sa1: [
    { code: "20607114301", areaKm2: 1, values: raw({ pop: 200, medAge: 50, medHhInc: 1000, tenRent: 40 }), geometry: box(144.98, -37.802, 144.982, -37.798) },
  ],
};

describe("census SA1 selection", () => {
  it("decodes delta-encoded rings", () => {
    expect(decodeRing(encode([[144.98, -37.8], [144.99, -37.79]]), SCALE)).toEqual([
      [144.98, -37.8],
      [144.99, -37.79],
    ]);
  });

  it("keeps only SA2 chunks whose bbox touches the site", () => {
    const index = {
      sa2: [
        { code: "near", name: "Near", gcc: "2GMEL", bbox: [144.97, -37.81, 144.99, -37.79] },
        { code: "far", name: "Far", gcc: "2GMEL", bbox: [146, -38, 146.1, -37.9] },
      ],
    } as unknown as CensusIndex;
    expect(candidateSa2Codes(index, CENTER, 300)).toEqual(["near"]);
  });

  it("selects intersecting SA1s with their area fraction and skips distant ones", () => {
    const picked = selectSa1s([chunkA, chunkB], SCALE, CENSUS_FIELDS, CENTER, 200, "square");
    expect(picked.map((sa1) => sa1.code)).toEqual(["20607114201", "20607114301"]);
    const whole = picked[0];
    expect(whole.containsCentre).toBe(true);
    expect(whole.fraction).toBeGreaterThan(0.005);
    expect(whole.fraction).toBeLessThan(0.02);
    expect(whole.clippedKm2).toBeCloseTo(0.04, 2);
    const half = picked[1];
    expect(half.fraction).toBeGreaterThan(0.2);
    expect(half.fraction).toBeLessThan(0.3);
    expect(parentSa2Code(picked)).toBe("206071142");
  });

  it("clips to a circular frame with less area than the square", () => {
    const square = selectSa1s([chunkA], SCALE, CENSUS_FIELDS, CENTER, 200, "square");
    const circle = selectSa1s([chunkA], SCALE, CENSUS_FIELDS, CENTER, 200, "circle");
    expect(circle[0].clippedKm2).toBeLessThan(square[0].clippedKm2);
    expect(circle[0].clippedKm2).toBeCloseTo((Math.PI * 100 * 100) / 1e6, 2);
  });
});

describe("census aggregation", () => {
  it("apportions counts by fraction and population-weights medians", () => {
    const base = { sa2Code: "x", clippedKm2: 0.5, rings: [], clipped: [], containsCentre: false };
    const summary = aggregateSa1s([
      { ...base, code: "a", fraction: 1, values: toValues(raw({ pop: 300, medAge: 30, medHhInc: 2000, tenRent: 90 })) },
      { ...base, code: "b", fraction: 0.5, values: toValues(raw({ pop: 200, medAge: 60, medHhInc: 0, tenRent: 40 })) },
    ]);
    expect(summary.values.pop).toBe(400);
    expect(summary.values.tenRent).toBe(110);
    expect(summary.values.medAge).toBeCloseTo((30 * 300 + 60 * 100) / 400);
    expect(summary.values.medHhInc).toBe(2000);
    expect(summary.densityPerKm2).toBe(400);
    expect(summary.estimated).toBe(true);
  });

  it("is not an estimate when every SA1 is wholly inside", () => {
    const summary = aggregateSa1s([
      { code: "a", sa2Code: "x", clippedKm2: 1, rings: [], clipped: [], containsCentre: true, fraction: 1, values: toValues(raw({ pop: 10 })) },
    ]);
    expect(summary.estimated).toBe(false);
  });

  it("rounds the 100-people chart to exactly 100 by largest remainder", () => {
    expect(hundredPeople([1, 1, 1])).toEqual([34, 33, 33]);
    expect(hundredPeople([0, 0])).toEqual([0, 0]);
    expect(hundredPeople([5, 15]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(share(1, [1, 3])).toBe(0.25);
    expect(share(1, [0])).toBe(0);
  });

  it("maps values by the field order shipped in the index", () => {
    expect(toValues([7, 9], ["medAge", "pop"]).pop).toBe(9);
    expect(toValues([7, 9], ["medAge", "pop"]).car0).toBe(0);
  });
});

describe("census loading", () => {
  const index = {
    source: CENSUS_ATTRIBUTION,
    fields: CENSUS_FIELDS,
    coordScale: SCALE,
    greaterMelbourne: raw({ pop: 4917750 }),
    sa2: [
      { code: "206071142", name: "Fitzroy", gcc: "2GMEL", bbox: [144.97, -37.81, 144.99, -37.79] },
      { code: "206071143", name: "Next door", gcc: "2GMEL", bbox: [144.98, -37.802, 144.982, -37.798] },
    ],
  };
  const respond = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("loads the index and only the chunks it needs", async () => {
    const seen: string[] = [];
    const result = await loadCensusForSite(CENTER, 200, "square", {
      baseUrl: "/c/",
      fetcher: (url) => {
        seen.push(url);
        if (url.endsWith("index.json")) return respond(index);
        return respond(url.includes("206071142") ? chunkA : chunkB);
      },
    });
    expect(result.status).toBe("ok");
    expect(seen).toEqual(["/c/index.json", "/c/sa2/206071142.json", "/c/sa2/206071143.json"]);
  });

  it("names the source when a file fails", async () => {
    const result = await loadCensusForSite(CENTER, 200, "square", { baseUrl: "/c/", fetcher: () => respond({}, 404) });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.reason).toMatch(/ABS Census 2021.*HTTP 404/);
  });

  it("is unavailable outside coverage", async () => {
    const result = await loadCensusForSite({ lat: -33.86, lon: 151.2 }, 200, "square", {
      baseUrl: "/c/",
      fetcher: () => respond(index),
    });
    expect(result.status).toBe("unavailable");
  });
});
