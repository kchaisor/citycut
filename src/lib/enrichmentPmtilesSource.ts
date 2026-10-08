import type { RangeResponse } from "pmtiles";

type RangeResult = RangeResponse & { data: ArrayBuffer };

const inflightRanges = new Map<string, Promise<RangeResult>>();

async function fetchRangeOnce(
  url: string,
  offset: number,
  length: number,
  signal?: AbortSignal,
  etag?: string,
  allowEmptyRetry = true,
): Promise<RangeResult> {
  const headers = new Headers();
  headers.set("range", `bytes=${offset}-${offset + length - 1}`);
  if (etag) headers.set("If-None-Match", etag);
  const response = await fetch(url, { signal, headers, cache: "no-store" });
  if (response.status >= 300) {
    throw new Error(`Bad response code: ${response.status}`);
  }
  const data = await response.arrayBuffer();
  if (data.byteLength === 0 && length > 0 && allowEmptyRetry) {
    return fetchRangeOnce(url, offset, length, signal, etag, false);
  }
  const responseEtag = response.headers.get("Etag");
  return {
    data,
    etag: responseEtag?.startsWith("W/") ? undefined : responseEtag ?? undefined,
    cacheControl: response.headers.get("Cache-Control") ?? undefined,
    expires: response.headers.get("Expires") ?? undefined,
  };
}

function dedupedRangeFetch(
  url: string,
  offset: number,
  length: number,
  signal?: AbortSignal,
  etag?: string,
): Promise<RangeResult> {
  const key = `${url}|${offset}|${length}`;
  let pending = inflightRanges.get(key);
  if (!pending) {
    pending = fetchRangeOnce(url, offset, length, signal, etag);
    inflightRanges.set(key, pending);
    void pending.finally(() => {
      if (inflightRanges.get(key) === pending) inflightRanges.delete(key);
    });
  }
  return pending;
}

/** Range reads for building-enrichment.pmtiles: dedupe concurrent requests, avoid cache poisoning. */
export class EnrichmentPmtilesSource {
  constructor(private readonly url: string) {}

  getKey(): string {
    return this.url;
  }

  getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string,
  ): Promise<RangeResult> {
    return dedupedRangeFetch(this.url, offset, length, signal, etag);
  }
}
