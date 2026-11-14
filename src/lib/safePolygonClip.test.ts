import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/sydney-rozelle-road-union.json";
import { clipUnion, type MultiPolygon } from "./safePolygonClip";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));
const SAFE_CLIP = "lib/safePolygonClip.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [full];
  });
}

describe("safePolygonClip", () => {
  it("unions the Sydney Rozelle arterial road partition operands that used to throw", () => {
    const union = clipUnion(fixture.nswArterial as MultiPolygon, fixture.outside as MultiPolygon, {
      layer: fixture.layer,
      operation: fixture.operation,
      featureId: fixture.grade,
    });
    expect(union.length).toBeGreaterThan(0);
    expect(union.some((polygon) => polygon[0]!.some(([x]) => Math.abs(x + 650) < 2))).toBe(true);
  });

  it("keeps polygon-clipping runtime imports inside safePolygonClip only", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      const relative = path.relative(srcRoot, file).split(path.sep).join("/");
      if (relative === SAFE_CLIP) continue;
      const text = readFileSync(file, "utf8");
      if (/import\s+\*\s+as\s+polygonClipping/.test(text) || /import polygonClipping\b/.test(text)) {
        offenders.push(relative);
        continue;
      }
      for (const line of text.split("\n")) {
        if (!line.includes("polygon-clipping")) continue;
        if (/from\s+["']polygon-clipping["']/.test(line) && !/import\s+type\s+/.test(line)) offenders.push(relative);
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
