import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MANIFEST_NAME as ENRICHMENT_MANIFEST_NAME,
  PMTILES_NAME as ENRICHMENT_PMTILES_NAME,
  RELEASE as ENRICHMENT_RELEASE,
  installVerifiedRelease,
  resolveEnrichmentDeploy,
} from "./fetch-building-enrichment-lib.mjs";
import { resolveTreesDeploy, TREES_RELEASE } from "./fetch-trees-lib.mjs";
import { TREES_MANIFEST_NAME, TREES_PMTILES_NAME } from "./trees-prebake-lib.mjs";

const REPO_RELEASES_BASE = "https://github.com/kchaisor/citycut/releases/download";

export function hasPrebakedTrees(publicDir = "public") {
  const tilesPath = join(publicDir, TREES_PMTILES_NAME);
  const manifestPath = join(publicDir, TREES_MANIFEST_NAME);
  if (!existsSync(tilesPath) || !existsSync(manifestPath)) return false;
  try {
    return statSync(tilesPath).size > 1_000_000;
  } catch {
    return false;
  }
}

export function hasFullBuildingEnrichment(publicDir = "public") {
  const tilesPath = join(publicDir, ENRICHMENT_PMTILES_NAME);
  const manifestPath = join(publicDir, ENRICHMENT_MANIFEST_NAME);
  if (!existsSync(tilesPath) || !existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof manifest?.regionName === "string" && manifest.regionName.includes("committed fallback")) {
      return false;
    }
    return statSync(tilesPath).size > 20_000_000;
  } catch {
    return false;
  }
}

async function downloadFile(url, destPath, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(destPath, bytes);
}

export async function ensurePrebakedTrees({
  publicDir = "public",
  release = TREES_RELEASE,
  releasesBase = REPO_RELEASES_BASE,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (hasPrebakedTrees(publicDir)) {
    console.info(`[prebake] ${TREES_PMTILES_NAME} already present in ${publicDir}/; skipping download.`);
    return { status: "skipped" };
  }
  const tempDir = mkdtempSync(join(tmpdir(), "citycut-prebake-trees-"));
  try {
    const baseUrl = `${releasesBase}/${release}`;
    await Promise.all([
      downloadFile(`${baseUrl}/${TREES_MANIFEST_NAME}`, join(tempDir, TREES_MANIFEST_NAME), fetchImpl),
      downloadFile(`${baseUrl}/${TREES_PMTILES_NAME}`, join(tempDir, TREES_PMTILES_NAME), fetchImpl),
    ]);
    const check = resolveTreesDeploy({ tempDir, downloadOk: true });
    if (!check.ok) {
      console.warn(`[prebake] trees release verification failed (${check.message}); skipping.`);
      return { status: "failed", message: check.message };
    }
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(join(tempDir, TREES_PMTILES_NAME), join(publicDir, TREES_PMTILES_NAME));
    copyFileSync(join(tempDir, TREES_MANIFEST_NAME), join(publicDir, TREES_MANIFEST_NAME));
    console.info(`[prebake] Installed ${release}/${TREES_PMTILES_NAME} (${check.bytes} bytes) into ${publicDir}/.`);
    return { status: "installed", bytes: check.bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[prebake] Could not download ${release} (${message}); runtime fallback remains active.`);
    return { status: "failed", message };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function ensureFullBuildingEnrichment({
  publicDir = "public",
  release = ENRICHMENT_RELEASE,
  releasesBase = REPO_RELEASES_BASE,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (hasFullBuildingEnrichment(publicDir)) {
    console.info(`[prebake] Full ${ENRICHMENT_PMTILES_NAME} already present in ${publicDir}/; skipping download.`);
    return { status: "skipped" };
  }
  const tempDir = mkdtempSync(join(tmpdir(), "citycut-prebake-enrichment-"));
  try {
    const baseUrl = `${releasesBase}/${release}`;
    await Promise.all([
      downloadFile(`${baseUrl}/${ENRICHMENT_MANIFEST_NAME}`, join(tempDir, ENRICHMENT_MANIFEST_NAME), fetchImpl),
      downloadFile(`${baseUrl}/${ENRICHMENT_PMTILES_NAME}`, join(tempDir, ENRICHMENT_PMTILES_NAME), fetchImpl),
    ]);
    const decision = resolveEnrichmentDeploy({
      publicDir,
      tempDir,
      ghToken: "public-http",
      releaseDownloadOk: true,
      releaseMissing: false,
    });
    if (decision.outcome !== "release_ok") {
      console.warn(`[prebake] enrichment release verification failed (${decision.message}); keeping existing ${publicDir}/ files.`);
      return { status: "failed", message: decision.message };
    }
    installVerifiedRelease(publicDir, tempDir, decision);
    console.info(`[prebake] Installed verified ${release}/${ENRICHMENT_PMTILES_NAME} into ${publicDir}/.`);
    return { status: "installed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[prebake] Could not download ${release} (${message}); keeping existing ${publicDir}/ files.`);
    return { status: "failed", message };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function fetchPrebakedPmtiles(options = {}) {
  const [trees, enrichment] = await Promise.all([
    ensurePrebakedTrees(options),
    ensureFullBuildingEnrichment(options),
  ]);
  return { trees, enrichment };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await fetchPrebakedPmtiles();
}
