import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { relFromRoot, walkFiles, readText } from "./repoScan";

const repoRoot = join(import.meta.dirname, "../../..");
const componentsRoot = join(repoRoot, "src/components");
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgb\(/g;

const FIXTURE_BAD = `
export function Bad() {
  return <div style={{ color: "#ff0000" }} />;
}
`;

export function scanTsxColourLiterals(source: string): string[] {
  const hits: string[] = [];
  HEX.lastIndex = 0;
  let match = HEX.exec(source);
  while (match) {
    hits.push(match[0]);
    match = HEX.exec(source);
  }
  return hits;
}

describe("lint: TSX colour literals", () => {
  it("flags hardcoded hex in component TSX", () => {
    expect(scanTsxColourLiterals(FIXTURE_BAD)).toEqual(["#ff0000"]);
  });

  it("passes current component TSX sources", () => {
    const offenders: string[] = [];
    for (const file of walkFiles(componentsRoot, (path) => /\.tsx$/.test(path) && !/\.test\.tsx$/.test(path))) {
      const rel = relFromRoot(join(repoRoot, "src"), file);
      const hits = scanTsxColourLiterals(readText(file));
      if (hits.length > 0) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
