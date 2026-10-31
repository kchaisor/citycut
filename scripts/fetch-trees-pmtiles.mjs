import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTreesDeploy, TREES_RELEASE } from "./fetch-trees-lib.mjs";
import { TREES_MANIFEST_NAME, TREES_PMTILES_NAME } from "./trees-prebake-lib.mjs";

const publicDir = process.env.TREES_PUBLIC_DIR ?? "public";
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
const tempDir = mkdtempSync(join(tmpdir(), "citycut-trees-"));
try {
  let download = { status: 1, stderr: "no GH_TOKEN" };
  if (token) {
    download = spawnSync(
      "gh",
      ["release", "download", TREES_RELEASE, "-p", TREES_PMTILES_NAME, "-p", TREES_MANIFEST_NAME, "-D", tempDir, "--clobber"],
      { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } },
    );
  }
  const result = resolveTreesDeploy({ tempDir, downloadOk: download.status === 0, downloadError: download.stderr || download.stdout || "" });
  if (result.ok) {
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(join(tempDir, TREES_PMTILES_NAME), join(publicDir, TREES_PMTILES_NAME));
    copyFileSync(join(tempDir, TREES_MANIFEST_NAME), join(publicDir, TREES_MANIFEST_NAME));
    console.info(`[trees] Installed ${TREES_RELEASE} (${result.bytes} bytes, built ${result.generatedAt}) into ${publicDir}/`);
  } else {
    rmSync(join(publicDir, TREES_PMTILES_NAME), { force: true });
    rmSync(join(publicDir, TREES_MANIFEST_NAME), { force: true });
    console.warn(`[trees] ${result.message}; the site will use the live tree servers.`);
  }
} catch (err) {
  rmSync(join(publicDir, TREES_PMTILES_NAME), { force: true });
  rmSync(join(publicDir, TREES_MANIFEST_NAME), { force: true });
  console.warn(`[trees] install failed (${err instanceof Error ? err.message : err}); the site will use the live tree servers.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
