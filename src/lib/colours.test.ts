import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COLOUR_FALLBACK, COLOUR_KEYS, getColour } from "./colours";
import { cssColorToHex, parseCustomProperties, resolveSheet } from "./cssVars";

const srcRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Files that are allowed to keep a colour literal, with the reason.
 * Fills, the plan, the 3D view, and the exporters are not on this list.
 */
const HEX_ALLOWLIST: Record<string, string> = {
  // Tree crowns are vertex colours baked into the glTF files. The form builder
  // has to keep those channel values so the shipped meshes stay byte-identical.
  "lib/treeForms.ts": "baked tree-archetype vertex colours; the glTF files must match the builder",
};

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgb\(/g;

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await sourceFiles(full)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    found.push(full);
  }
  return found;
}

describe("colour fallbacks", () => {
  it("matches colours.css value by value", async () => {
    const css = await readFile(fileURLToPath(new URL("../colours.css", import.meta.url)), "utf8");
    const declared = resolveSheet(parseCustomProperties(css));
    const keys = Object.keys(declared).filter((name) => name.startsWith("--"));
    expect(keys.sort()).toEqual([...COLOUR_KEYS].sort());
    for (const key of COLOUR_KEYS) {
      const value = cssColorToHex(declared[key]);
      expect(value, key).toBe(COLOUR_FALLBACK[key]);
      expect(getColour(key)).toBe(COLOUR_FALLBACK[key]);
    }
  });

  it("rejects a colour literal outside the allowlist", async () => {
    const files = await sourceFiles(srcRoot);
    const hits: string[] = [];
    for (const file of files) {
      const relative = path.relative(srcRoot, file).split(path.sep).join("/");
      if (HEX_ALLOWLIST[relative]) continue;
      const text = await readFile(file, "utf8");
      HEX.lastIndex = 0;
      const match = HEX.exec(text);
      if (match) hits.push(`${relative}: ${match[0]}`);
    }
    expect(hits).toEqual([]);
    for (const relative of Object.keys(HEX_ALLOWLIST)) {
      const text = await readFile(path.join(srcRoot, relative), "utf8");
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
