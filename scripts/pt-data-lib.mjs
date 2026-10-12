/**
 * Where to download Transport Victoria's PT lines and stops GeoJSON.
 *
 * The dataset's resource ids change when Transport Victoria re-publishes it (on 2026-10-12 both
 * changed and the hard-coded URLs 404'd, breaking the Pages deploy). So at build time we ask the
 * CKAN API (package_show) for the current resources and pick lines/stops by name and format, not
 * by position. If that lookup fails we fall back to the last known-good resource ids. If neither
 * works we throw, naming every URL tried.
 */

export const PT_DATASET_ID = "6d36dfd9-8693-4552-8a03-05eb29a391fd";
export const PT_PACKAGE_SHOW_URL = `https://opendata.transport.vic.gov.au/api/3/action/package_show?id=${PT_DATASET_ID}`;

const resourceUrl = (id, file) =>
  `https://opendata.transport.vic.gov.au/dataset/${PT_DATASET_ID}/resource/${id}/download/${file}`;

/** Known-good as of 2026-10-12. Only used when the package_show lookup fails. */
export const PT_FALLBACK = {
  lines: {
    id: "d8e5a974-98ba-4823-af5f-b0d2185263ac",
    url: resourceUrl("d8e5a974-98ba-4823-af5f-b0d2185263ac", "public_transport_lines.geojson"),
  },
  stops: {
    id: "0b8332b8-ee9a-43a0-b83a-367693c0e74e",
    url: resourceUrl("0b8332b8-ee9a-43a0-b83a-367693c0e74e", "public_transport_stops.geojson"),
  },
};

export const PT_KINDS = /** @type {const} */ (["lines", "stops"]);

const isGeojson = (r) =>
  /geo\+?json/i.test(String(r.format ?? "")) ||
  /geo\+json/i.test(String(r.mimetype ?? "")) ||
  /\.geojson(\?|$)/i.test(String(r.url ?? ""));

/** "lines" matches a name like "Public Transport Lines" or a file public_transport_lines.geojson. */
function mentions(r, kind) {
  const word = new RegExp(`(^|[^a-z])${kind}([^a-z]|$)`, "i");
  const file = String(r.url ?? "").split("?")[0].split("/").pop() ?? "";
  return word.test(String(r.name ?? "")) || word.test(file);
}

/**
 * Pick the lines and stops GeoJSON resources from a package_show response.
 * A resource must be GeoJSON, active (when state is given), have an http(s) URL, and name the
 * kind in its name or file name, and not the other kind. With several matches the most recently
 * modified wins. Returns { lines, stops }, each { id, name, url } or null.
 */
export function matchPtResources(packageShow) {
  const resources = packageShow?.result?.resources;
  const out = { lines: null, stops: null };
  if (!packageShow?.success || !Array.isArray(resources)) return out;
  for (const kind of PT_KINDS) {
    const other = kind === "lines" ? "stops" : "lines";
    const hits = resources
      .filter((r) => r && /^https?:\/\//i.test(String(r.url ?? "")))
      .filter((r) => r.state == null || r.state === "active")
      .filter((r) => isGeojson(r) && mentions(r, kind) && !mentions(r, other))
      .sort((a, b) => String(b.last_modified ?? "").localeCompare(String(a.last_modified ?? "")));
    if (hits.length) out[kind] = { id: hits[0].id, name: hits[0].name, url: hits[0].url };
  }
  return out;
}

/** Look up current resource URLs. Never throws: returns { found, error }. */
export async function lookupPtResources({ fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  try {
    const res = await fetchImpl(PT_PACKAGE_SHOW_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { found: { lines: null, stops: null }, error: `package_show HTTP ${res.status}` };
    const found = matchPtResources(await res.json());
    const missing = PT_KINDS.filter((k) => !found[k]);
    return { found, error: missing.length ? `package_show has no GeoJSON resource for ${missing.join(" and ")}` : null };
  } catch (err) {
    return { found: { lines: null, stops: null }, error: `package_show failed: ${err?.message ?? err}` };
  }
}

/**
 * Ordered download candidates per kind: the looked-up URL first (if any), then the fallback.
 * Each candidate is { url, source } where source says where it came from, for the build log.
 */
export function ptCandidates(found) {
  const out = {};
  for (const kind of PT_KINDS) {
    const list = [];
    if (found?.[kind]?.url) list.push({ url: found[kind].url, source: `dataset API package_show (resource ${found[kind].id})` });
    if (!list.some((c) => c.url === PT_FALLBACK[kind].url)) {
      list.push({ url: PT_FALLBACK[kind].url, source: `known-good fallback (resource ${PT_FALLBACK[kind].id})` });
    }
    out[kind] = list;
  }
  return out;
}

/**
 * Try each candidate in order with `attempt(url)` (which should throw on failure). Logs which URL
 * was used. If every candidate fails, throws one error listing each URL and why it failed.
 */
export async function useFirstWorking(kind, candidates, attempt, log = console.log) {
  const failures = [];
  for (const c of candidates) {
    try {
      const result = await attempt(c.url);
      log(`PT ${kind}: using ${c.url} [${c.source}]`);
      return { ...c, result };
    } catch (err) {
      failures.push(`  ${c.url} [${c.source}]: ${err?.message ?? err}`);
      log(`PT ${kind}: FAILED ${c.url} [${c.source}]: ${err?.message ?? err}`);
    }
  }
  throw new Error(
    `PT ${kind}: no working download URL. Both the dataset API lookup and the fallback failed:\n${failures.join("\n")}\n` +
      `Check ${PT_PACKAGE_SHOW_URL} and update PT_FALLBACK in scripts/pt-data-lib.mjs.`,
  );
}

/** Cheap reachability check: a 1-byte range GET (some CKAN downloads don't answer HEAD). */
export async function probeUrl(url, { fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  const res = await fetchImpl(url, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(timeoutMs) });
  await res.body?.cancel?.();
  if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  return res.status;
}
