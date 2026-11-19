import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(path));
    else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const threeArgPoint = /pointInSiteFrame\s*\(\s*[^,]+,\s*[^,]+,\s*[^,)]+\s*\)/;
const threeArgClipLine = /clipPolylineSiteFrame\s*\(\s*[^,]+,\s*[^,]+,\s*[^,)]+\s*\)/;

describe("site frame clip lint", () => {
  it("does not clip with shape alone (missing frame dimensions)", () => {
    const violations: string[] = [];
    for (const file of walk(SRC)) {
      if (file.endsWith("siteFrameClipLint.test.ts") || file.endsWith("siteFrame.ts")) continue;
      const text = readFileSync(file, "utf8");
      if (threeArgPoint.test(text)) violations.push(`${file}: pointInSiteFrame without frame size`);
      if (threeArgClipLine.test(text)) violations.push(`${file}: clipPolylineSiteFrame without frame size`);
    }
    expect(violations).toEqual([]);
  });
});