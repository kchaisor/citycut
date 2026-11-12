import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { get as httpGet } from "node:https";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const jarDir = join(root, ".tla-tools");
const jarPath = join(jarDir, "tla2tools.jar");
const jarUrl = "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar";

function download(url, dest) {
  return new Promise((resolve, reject) => {
    httpGet(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const next = response.headers.location;
        if (!next) return reject(new Error("redirect without location"));
        download(next, dest).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      const file = createWriteStream(dest);
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve(undefined)));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function ensureJar() {
  mkdirSync(jarDir, { recursive: true });
  if (existsSync(jarPath)) return;
  await download(jarUrl, jarPath);
}

function runTlc(specName) {
  const tla = join(root, "specs", `${specName}.tla`);
  const cfg = join(root, "specs", `${specName}.cfg`);
  const result = spawnSync("java", ["-cp", jarPath, "tlc2.TLC", "-config", cfg, tla], {
    stdio: "inherit",
    cwd: root,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await ensureJar();
for (const spec of ["BuildingInfoCard", "IntroPlayback", "LoadingHandoff"]) {
  runTlc(spec);
}
