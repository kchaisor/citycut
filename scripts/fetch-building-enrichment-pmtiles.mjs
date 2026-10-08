/**
 * Ensure public/building-enrichment.pmtiles + manifest match the latest release before build.
 * Falls back to committed copies when the release download or hash check fails.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  MANIFEST_NAME,
  PMTILES_NAME,
  RELEASE,
  installVerifiedRelease,
  resolveEnrichmentDeploy,
} from "./fetch-building-enrichment-lib.mjs";

const publicDir = "public";

function downloadReleaseToTemp(tempDir, ghToken) {
  const view = spawnSync("gh", ["release", "view", RELEASE], {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: ghToken },
  });
  if (view.status !== 0) {
    return { ok: false, missing: true, stderr: view.stderr || view.stdout };
  }
  const download = spawnSync(
    "gh",
    [
      "release",
      "download",
      RELEASE,
      "-p",
      PMTILES_NAME,
      "-p",
      MANIFEST_NAME,
      "-D",
      tempDir,
      "--clobber",
    ],
    { encoding: "utf8", env: { ...process.env, GH_TOKEN: ghToken } },
  );
  if (download.status !== 0) {
    return { ok: false, missing: false, stderr: download.stderr || download.stdout };
  }
  return { ok: true };
}

function main() {
  const ghToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
  const tempDir = mkdtempSync(join(tmpdir(), "citycut-enrichment-"));
  try {
    let releaseDownloadOk = false;
    let releaseMissing = false;
    if (ghToken) {
      const dl = downloadReleaseToTemp(tempDir, ghToken);
      releaseDownloadOk = dl.ok;
      releaseMissing = dl.missing === true;
      if (!dl.ok) {
        console.warn(`[enrichment] ${releaseMissing ? "release not found" : "release download failed"}: ${dl.stderr ?? ""}`.trim());
      }
    } else {
      console.warn("[enrichment] no GH_TOKEN; skipping release download");
    }

    const decision = resolveEnrichmentDeploy({
      publicDir,
      tempDir,
      ghToken,
      releaseDownloadOk,
      releaseMissing,
    });

    console.info(`[enrichment] ${decision.message}`);

    if (decision.outcome === "release_ok") {
      installVerifiedRelease(publicDir, tempDir, decision);
      console.info(`[enrichment] Installed verified release assets into ${publicDir}/`);
      return;
    }

    if (decision.outcome === "committed_fallback") {
      if (!existsSync(join(publicDir, PMTILES_NAME))) {
        console.warn("[enrichment] No committed building-enrichment.pmtiles fallback.");
      }
      return;
    }

    if (decision.outcome === "no_token" || decision.outcome === "release_not_found") {
      return;
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main();
