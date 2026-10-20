import { squareBBox, toLocal } from "./geo";
import { DEFAULT_SITE_FRAME_SHAPE, pointInSiteFrame } from "./siteFrame";
import type { PublicTransportStop, TransportRailStation } from "./explodedAxoOverlayFetch";
import type { CityModel, Pt } from "../types";

/**
 * NSW rail and public transport for the exploded axo, source of truth first:
 *  1. NSW Spatial Services (no key): Railway lines and railway stations / light rail stops,
 *     already loaded with the model (model.nsw.railways, model.nsw.stations).
 *  2. Transport for NSW Open Data (GTFS stops, routes) needs a registered API key: an
 *     unauthenticated request answers HTTP 401 (checked 2026-10-19), so CityCut does not use it.
 *  3. Bus stops therefore come from OpenStreetMap (ODbL) via the Overpass API, labelled as such.
 *     Bus routes are not drawn: without GTFS there is no official route geometry.
 */

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const OSM_BUS_TIMEOUT_MS = 25_000;
export const TFNSW_KEY_NOTE =
  "Transport for NSW GTFS needs an API key (HTTP 401 without one), so bus stops are from OpenStreetMap (ODbL) and bus routes are not drawn.";

export type OsmFetch = (url: string, init: { method: "POST"; body: string; signal: AbortSignal }) => Promise<{ status: number; json: () => Promise<unknown> }>;

const defaultFetch: OsmFetch = async (url, init) => {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return { status: response.status, json: () => response.json() as Promise<unknown> };
};

/** OSM bus stops in the frame. Never retried: 429 means the public server asked us to stop. */
export async function fetchOsmBusStops(
  model: Pick<CityModel, "center" | "sideM" | "frameShape">,
  options: { signal?: AbortSignal; fetchImpl?: OsmFetch; timeoutMs?: number } = {},
): Promise<{ stops: Pt[]; note: string | null }> {
  const b = squareBBox(model.center, model.sideM);
  const query = `[out:json][timeout:20];(node["highway"="bus_stop"](${b.south},${b.west},${b.north},${b.east});node["public_transport"="platform"]["bus"="yes"](${b.south},${b.west},${b.north},${b.east}););out body;`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? OSM_BUS_TIMEOUT_MS);
  const relay = () => controller.abort();
  options.signal?.addEventListener("abort", relay);
  try {
    const response = await (options.fetchImpl ?? defaultFetch)(OVERPASS_URL, { method: "POST", body: `data=${encodeURIComponent(query)}`, signal: controller.signal });
    if (response.status === 429) return { stops: [], note: "OpenStreetMap bus stops: Overpass is rate limiting (HTTP 429); not retried." };
    if (response.status < 200 || response.status >= 300) return { stops: [], note: `OpenStreetMap bus stops: Overpass answered HTTP ${response.status}.` };
    const body = (await response.json()) as { elements?: { lat?: number; lon?: number; id?: number }[] };
    const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
    const seen = new Set<number>();
    const stops: Pt[] = [];
    for (const el of body.elements ?? []) {
      if (typeof el.lat !== "number" || typeof el.lon !== "number" || (el.id != null && seen.has(el.id))) continue;
      if (el.id != null) seen.add(el.id);
      const p = toLocal(el.lat, el.lon, model.center);
      if (pointInSiteFrame(p, model.sideM, shape)) stops.push(p);
    }
    return { stops, note: null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { stops: [], note: timedOut ? "OpenStreetMap bus stops: no answer from Overpass within 25 s." : "OpenStreetMap bus stops: the request failed." };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", relay);
  }
}

export type NswTransportOverlay = {
  rail: { lines: Pt[][]; stations: TransportRailStation[] };
  pt: { lines: never[]; stops: PublicTransportStop[] };
  note: string;
};

/** Stations and stops for the axo transport plate in NSW mode, with a note naming every source. */
export async function nswTransportOverlay(
  model: CityModel,
  options: { signal?: AbortSignal; fetchImpl?: OsmFetch } = {},
): Promise<NswTransportOverlay | null> {
  const nsw = model.nsw;
  if (!nsw) return null;
  const live = nsw.stations.filter((station) => station.operational);
  const train = live.filter((station) => !station.lightRail).map((station) => station.at);
  const tram = live.filter((station) => station.lightRail).map((station) => ({ mode: "tram" as const, point: station.at }));
  const bus = await fetchOsmBusStops(model, options);
  const notes = [
    `Transport: NSW Spatial Services stations (${train.length}) and light rail stops (${tram.length})`,
    bus.note ?? `bus stops from OpenStreetMap (ODbL) via Overpass (${bus.stops.length})`,
    TFNSW_KEY_NOTE,
  ];
  if (nsw.status.stations.status !== "ok" && nsw.status.stations.note) notes.push(nsw.status.stations.note);
  return {
    rail: { lines: nsw.railways.filter((rail) => rail.operational).map((rail) => rail.line), stations: train },
    pt: { lines: [], stops: [...tram, ...bus.stops.map((point) => ({ mode: "bus" as const, point }))] },
    note: notes.join("; "),
  };
}
