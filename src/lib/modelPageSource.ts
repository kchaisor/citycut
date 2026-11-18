import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));

export function readModelPageSource(): string {
  const modelDir = join(srcRoot, "components", "model");
  const barrel = readFileSync(join(srcRoot, "components", "ModelPage.tsx"), "utf8");
  const parts = readdirSync(modelDir).map((name) =>
    readFileSync(join(modelDir, name), "utf8"),
  );
  return `${barrel}\n${parts.join("\n")}`;
}