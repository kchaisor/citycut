import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCensusForSite } from "./censusPeople";

const ROOT = path.resolve("public");
const PREFIX = "/citycut/";
const BOURKE_ST_MALL = { lat: -37.8136, lon: 144.9631 };

type Seen = { url: string; range?: string; ifNoneMatch?: string; encoding?: string; status: number; contentEncoding?: string };

function pagesLikeServer(seen: Seen[]): http.Server {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://pages");
    const file = path.join(ROOT, decodeURIComponent(url.pathname.slice(PREFIX.length)));
    const record: Seen = {
      url: url.pathname,
      range: req.headers.range,
      ifNoneMatch: req.headers["if-none-match"],
      encoding: req.headers["accept-encoding"],
      status: 200,
    };
    seen.push(record);
    if (!url.pathname.startsWith(PREFIX) || !file.startsWith(ROOT) || !fs.existsSync(file)) {
      record.status = 404;
      res.writeHead(404).end("not found");
      return;
    }
    const body = fs.readFileSync(file);
    const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;
    const headers: Record<string, string> = { ETag: etag, "Cache-Control": "max-age=600", Vary: "Accept-Encoding", "Content-Type": "application/json" };
    if (req.headers["if-none-match"] === etag) {
      record.status = 304;
      res.writeHead(304, headers).end();
      return;
    }
    const encodings = String(req.headers["accept-encoding"] ?? "");
    if (/gzip/.test(encodings) && !/^\s*identity\s*$/.test(encodings)) {
      record.contentEncoding = "gzip";
      res.writeHead(200, { ...headers, "Content-Encoding": "gzip" }).end(gzipSync(body));
      return;
    }
    const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ""));
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : body.length - 1;
      record.status = 206;
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${body.length}` }).end(body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, headers).end(body);
  });
}

describe("census files served the way GitHub Pages serves them", () => {
  const seen: Seen[] = [];
  const server = pagesLikeServer(seen);
  let base = "";

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${PREFIX}census/`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("loads real ABS figures for a Melbourne CBD cut over gzip", async () => {
    seen.length = 0;
    const result = await loadCensusForSite(BOURKE_ST_MALL, 400, "square", { baseUrl: base, fetcher: (url) => fetch(url) });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.greaterMelbourne.pop).toBe(4917750);
    expect(result.greaterMelbourne.medAge).toBe(37);
    expect(result.greaterMelbourne.medHhInc).toBe(1901);
    expect(result.parentSa2.name).toMatch(/^Melbourne CBD/);
    expect(result.parentSa2.values?.pop).toBeGreaterThan(0);
    expect(result.sa1.length).toBeGreaterThan(3);
    expect(result.site.values.pop).toBeGreaterThan(100);
    expect(result.site.values.medAge).toBeGreaterThan(18);
    expect(result.site.values.medAge).toBeLessThan(60);
    expect(seen.every((s) => s.status === 200 && s.contentEncoding === "gzip")).toBe(true);
  });

  it("never sends Range or If-None-Match itself, so it cannot be handed a bare 206 or 304", async () => {
    seen.length = 0;
    await loadCensusForSite(BOURKE_ST_MALL, 400, "square", { baseUrl: base, fetcher: (url) => fetch(url) });
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.filter((s) => s.range || s.ifNoneMatch)).toEqual([]);
  });

  it("decodes identical JSON whether the file arrives gzipped or as identity", async () => {
    const gz = await fetch(`${base}index.json`).then((r) => r.json());
    const plain = await fetch(`${base}index.json`, { headers: { "accept-encoding": "identity" } }).then((r) => r.json());
    expect(plain).toEqual(gz);
  });

  it("treats a 304 reply as a failure naming the source, never as data", async () => {
    const etag = (await fetch(`${base}index.json`)).headers.get("etag") ?? "";
    const conditional = (url: string) => fetch(url, { headers: { "if-none-match": etag, range: "bytes=0-99" } });
    expect((await conditional(`${base}index.json`)).status).toBe(304);
    const result = await loadCensusForSite(BOURKE_ST_MALL, 400, "square", { baseUrl: base, fetcher: conditional });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.reason).toMatch(/ABS Census 2021.*HTTP 304/);
  });

  it("reports unavailable for a site outside the bundled Victorian SA1s", async () => {
    const result = await loadCensusForSite({ lat: -33.8688, lon: 151.2093 }, 400, "square", { baseUrl: base, fetcher: (url) => fetch(url) });
    expect(result.status).toBe("unavailable");
  });

  it("keeps every file small once gzipped", () => {
    const dir = path.join(ROOT, "census", "sa2");
    const chunks = fs.readdirSync(dir).map((name) => fs.readFileSync(path.join(dir, name)));
    const index = fs.readFileSync(path.join(ROOT, "census", "index.json"));
    expect(gzipSync(index).length).toBeLessThan(40_000);
    expect(Math.max(...chunks.map((body) => gzipSync(body).length))).toBeLessThan(48_000);
    expect(chunks.reduce((sum, body) => sum + body.length, 0)).toBeLessThan(12_000_000);
  });
});
