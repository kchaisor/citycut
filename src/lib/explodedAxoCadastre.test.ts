import { describe, expect, it } from "vitest";
import {
  AXO_CADASTRE_PAGE_SIZE,
  AXO_CADASTRE_UNAVAILABLE_NOTE,
  cadastreQueryUrl,
  fetchCadastreOverlay,
} from "./explodedAxoCadastre";
import { buildExplodedAxoLayers, defaultExplodedAxoSettings } from "./explodedAxo";
import { plainDataCredit } from "./dataCredits";
import type { CityModel } from "../types";

const model = { placeLabel: "T", center: { lat: -37.8136, lon: 144.9631 }, sideM: 500, frameShape: "square", layers: {}, buildings: [], roads: [], areas: [], trees: [], roadKm: 0, buildingCapHit: false, sourceNote: "" } as unknown as CityModel;

const square = (dLon: number, dLat = 0) => {
  const lon = 144.9631 + dLon;
  const lat = -37.8136 + dLat;
  const s = 0.0001;
  return { type: "Polygon", coordinates: [[[lon, lat], [lon + s, lat], [lon + s, lat + s], [lon, lat + s], [lon, lat]]] };
};

function fakeFetch(pages: unknown[], calls: string[]): typeof fetch {
  return (async (url: string) => {
    calls.push(url);
    const offset = Number(new URL(url).searchParams.get("resultOffset"));
    const body = pages[offset / AXO_CADASTRE_PAGE_SIZE];
    if (body === "fail") return new Response("nope", { status: 500 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("exploded axo cadastre", () => {
  it("queries Vicmap_Parcel/FeatureServer/0 in pages of 2,000 for the frame envelope", () => {
    const url = new URL(cadastreQueryUrl(model, 4000));
    expect(url.pathname).toContain("Vicmap_Parcel/FeatureServer/0/query");
    expect(url.searchParams.get("resultRecordCount")).toBe("2000");
    expect(url.searchParams.get("resultOffset")).toBe("4000");
    expect(url.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
  });

  it("pages until the server stops reporting more, and de-duplicates stacked strata parcels", async () => {
    const full = { features: Array.from({ length: 3 }, () => ({ geometry: square(0) })), properties: { exceededTransferLimit: true } };
    const last = { features: [{ geometry: square(0.0005) }, { geometry: square(0.0005) }] };
    const calls: string[] = [];
    const result = await fetchCadastreOverlay(model, undefined, fakeFetch([full, last], calls));
    expect(calls).toHaveLength(2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rawCount).toBe(5);
    expect(result.data.parcels).toHaveLength(2);
    expect(result.data.partial).toBe(false);
  });

  it("drops parcels outside the frame", async () => {
    const result = await fetchCadastreOverlay(model, undefined, fakeFetch([{ features: [{ geometry: square(0.05) }] }], []));
    expect(result.ok && result.data.parcels.length).toBe(0);
  });

  it("a failed page fails the plate with a visible note, never silently", async () => {
    const result = await fetchCadastreOverlay(model, undefined, fakeFetch([{ features: [], properties: { exceededTransferLimit: true } }, "fail"], []));
    expect(result.ok).toBe(false);
    const settings = defaultExplodedAxoSettings(500);
    settings.layerVisible.cadastre = true;
    const plate = buildExplodedAxoLayers(model, settings, { cadastre: "unavailable" }).layers.find((l) => l.id === "cadastre")!;
    expect(plate.unavailableNote).toBe(AXO_CADASTRE_UNAVAILABLE_NOTE);
  });

  it("credits Vicmap Property when the plate is on", () => {
    expect(plainDataCredit({ cadastreOn: true })).toContain("Vicmap Property");
    expect(plainDataCredit({})).not.toContain("Vicmap Property");
  });
});
