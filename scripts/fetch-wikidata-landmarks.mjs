import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveWikidataDeploy,
  WIKIDATA_LANDMARKS_NAME,
  WIKIDATA_MANIFEST_NAME,
  WIKIDATA_RELEASE,
} from "./wikidata-landmarks-lib.mjs";

const publicDir = process.env.WIKIDATA_PUBLIC_DIR ?? "public";
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
const tempDir = mkdtempSync(join(tmpdir(), "citycut-wikidata-"));
const removeInstalled = () => {
  rmSync(join(publicDir, WIKIDATA_LANDMARKS_NAME), { force: true });
  rmSync(join(publicDir, WIKIDATA_MANIFEST_NAME), { force: true });
};
try {
  const download = token
    ? spawnSync(
        "gh",
        ["release", "download", WIKIDATA_RELEASE, "-p", WIKIDATA_LANDMARKS_NAME, "-p", WIKIDATA_MANIFEST_NAME, "-D", tempDir, "--clobber"],
        { encoding: "utf8", env: { ...process.env, GH_TOKEN: token } },
      )
    : { status: 1, stderr: "no GH_TOKEN" };
  const file = join(tempDir, WIKIDATA_LANDMARKS_NAME);
  const manifest = join(tempDir, WIKIDATA_MANIFEST_NAME);
  if (download.status !== 0 || !existsSync(file) || !existsSync(manifest)) {
    removeInstalled();
    console.warn(`[wikidata] release ${WIKIDATA_RELEASE} not downloaded (${(download.stderr || "assets missing").trim()}); the site will query Wikidata live.`);
  } else {
    const result = resolveWikidataDeploy({ body: readFileSync(file), manifestText: readFileSync(manifest, "utf8") });
    if (result.ok) {
      mkdirSync(publicDir, { recursive: true });
      copyFileSync(file, join(publicDir, WIKIDATA_LANDMARKS_NAME));
      copyFileSync(manifest, join(publicDir, WIKIDATA_MANIFEST_NAME));
      console.info(`[wikidata] Installed ${WIKIDATA_RELEASE} (${result.itemCount} items, queried ${result.queryDate}) into ${publicDir}/`);
    } else {
      removeInstalled();
      console.warn(`[wikidata] ${result.message}; the site will query Wikidata live.`);
    }
  }
} catch (err) {
  removeInstalled();
  console.warn(`[wikidata] install failed (${err instanceof Error ? err.message : err}); the site will query Wikidata live.`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
