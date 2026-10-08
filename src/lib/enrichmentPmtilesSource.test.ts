import { afterEach, describe, expect, it, vi } from "vitest";
import { EnrichmentPmtilesSource } from "./enrichmentPmtilesSource";

describe("EnrichmentPmtilesSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("dedupes concurrent range reads for the same url, offset, and length", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(new Uint8Array([1, 2, 3]).buffer, {
          status: 206,
          headers: { "content-length": "3" },
        });
      }),
    );
    const source = new EnrichmentPmtilesSource("https://example.test/enrichment.pmtiles");
    const [a, b] = await Promise.all([
      source.getBytes(100, 50),
      source.getBytes(100, 50),
    ]);
    expect(calls).toBe(1);
    expect(a.data.byteLength).toBe(3);
    expect(b.data).toBe(a.data);
  });

  it("retries once when a ranged response has an empty body", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        const body = calls === 1 ? new ArrayBuffer(0) : new Uint8Array([9]).buffer;
        return new Response(body, {
          status: 206,
          headers: { "content-length": String(body.byteLength || 184691) },
        });
      }),
    );
    const source = new EnrichmentPmtilesSource("https://example.test/enrichment.pmtiles");
    const result = await source.getBytes(2100602, 184691);
    expect(calls).toBe(2);
    expect(result.data.byteLength).toBe(1);
  });

  it("uses cache no-store on range fetches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        expect(init?.cache).toBe("no-store");
        return new Response(new Uint8Array([0]).buffer, { status: 206 });
      }),
    );
    const source = new EnrichmentPmtilesSource("https://example.test/enrichment.pmtiles");
    await source.getBytes(0, 1);
  });
});
