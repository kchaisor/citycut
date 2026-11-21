import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WIKIDATA_LANDMARKS_NAME, WIKIDATA_MANIFEST_NAME } from "../shared/wikidataLandmarks.js";
import { resolveWikidataDeploy, WIKIDATA_RELEASE } from "./fetch-wikidata-lib.mjs";

const publicDir = process.env.WIKIDATA_PUBLIC_DIR ?? "public";
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
const tempDir = mkdtempSync(join(tmpdir(), "citycut-wikidata-"));
const remove = () => {
  rmSync(join(publicDir, WIKIDATA_LANDMARKS_NAME), { force: true });
  rmSync(join(publicDir, WIKIDATA_MANIFEST_NAME), { force: true });
};
try {
  let download = { status: 1, stderr: "no GH_TOKEN" };
  if (token) {
    download = spawnSync(
      "gh",
      ["release", "download", WIKIDATA_RELEASE, "-p", WIKIDATA_LANDMARKS_NAME, "-p", WIKIDATA_MANIFEST_NAME, "-D", tempDir, "--clobber"],
      { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } },
    );
  }
  const result = resolveWikidataDeploy({ tempDir, downloadOk: download.status === 0, downloadError: download.stderr || download.stdout || "" });
  if (result.ok) {
    mkdirSync(publicDir, { recursive: true });
    copyFileSync(join(tempDir, WIKIDATA_LANDMARKS_NAME), join(publicDir, WIKIDATA_LANDMARKS_NAME));
    copyFileSync(join(tempDir, WIKIDATA_MANIFEST_NAME), join(publicDir, WIKIDATA_MANIFEST_NAME));
    console.info(`[wikidata] Installed ${WIKIDATA_RELEASE} (${result.items} items, ${result.bytes} bytes, queried ${result.queryDate}) into ${publicDir}/`);
  } else {
    remove();
    console.warn(`[wikidata] ${result.message}; the site will query Wikidata live.`);
  }
} catch (err) {
  remove();
  console.warn(`[wikidata] install failed (${err instanceof Error ? err.message : err}); the site will query Wikidata live.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
