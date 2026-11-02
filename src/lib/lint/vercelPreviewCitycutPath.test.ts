import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readText, relFromRoot, walkFiles } from "./repoScan";

const repoRoot = join(import.meta.dirname, "../../..");

const ALLOWLIST = new Set([
  "src/lib/lint/vercelPreviewCitycutPath.test.ts",
]);

const FIXTURE_BAD = `const url = "https://citycut.vercel.app/citycut/?qa=1";`;

export function scanVercelPreviewCitycutPaths(source: string): string[] {
  const hits: string[] = [];
  for (const match of source.matchAll(/https?:\/\/[^\s"'`]+vercel\.app[^\s"'`]*/g)) {
    if (match[0].includes("/citycut/")) hits.push(match[0]);
  }
  return hits;
}

describe("lint: Vercel preview paths", () => {
  it("flags /citycut/ on vercel.app URLs", () => {
    expect(scanVercelPreviewCitycutPaths(FIXTURE_BAD)).toHaveLength(1);
  });

  it("passes the repository except allowlisted fixtures", () => {
    const offenders: string[] = [];
    for (const file of walkFiles(repoRoot, (path) => !path.includes("node_modules") && !path.includes("/dist/"))) {
      if (/\.(png|jpg|webp|pmtiles|3dm|ai|json|lock)$/.test(file)) continue;
      const rel = relFromRoot(repoRoot, file);
      if (ALLOWLIST.has(rel)) continue;
      const hits = scanVercelPreviewCitycutPaths(readText(file));
      if (hits.length > 0) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
