import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseCustomProperties } from "./cssVars";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const TOKEN_FILES = ["src/theme.css", "src/drawing-style.css", "src/colours.css"];

const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

function tokenSources(): Map<string, { file: string; value: string }[]> {
  const sources = new Map<string, { file: string; value: string }[]>();
  for (const file of TOKEN_FILES) {
    for (const [name, value] of Object.entries(parseCustomProperties(read(file)))) {
      sources.set(name, [...(sources.get(name) ?? []), { file, value }]);
    }
  }
  return sources;
}

type DocRow = { line: number; names: string[]; values: string[] };

function docRows(): DocRow[] {
  const rows: DocRow[] = [];
  read("THEME.md")
    .split("\n")
    .forEach((text, index) => {
      if (!text.startsWith("| `--")) return;
      const cells = text.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      if (cells[0]!.includes("…")) return;
      const names = [...cells[0]!.matchAll(/`(--[\w-]+)`/g)].map((match) => match[1]!);
      const valueCell = cells.slice(1).find((cell) => /^`[^`]+`(\s*\/\s*`[^`]+`)*$/.test(cell));
      if (!valueCell) return;
      const values = [...valueCell.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
      if (values.length !== names.length) return;
      rows.push({ line: index + 1, names, values });
    });
  return rows;
}

describe("THEME.md matches the token files", () => {
  const sources = tokenSources();
  const rows = docRows();

  it("finds the settings tables", () => {
    expect(rows.length).toBeGreaterThan(100);
  });

  it("defines each token name in only one token file", () => {
    const clashes = [...sources].filter(([, defs]) => new Set(defs.map((d) => d.file)).size > 1).map(([name]) => name);
    expect(clashes).toEqual([]);
  });

  it("lists every value as it is in the CSS", () => {
    const wrong: string[] = [];
    for (const row of rows) {
      row.names.forEach((name, i) => {
        const defs = sources.get(name);
        if (!defs) {
          wrong.push(`THEME.md:${row.line} ${name} is not in any token file`);
          return;
        }
        const actual = defs[defs.length - 1]!.value;
        if (normalise(actual) !== normalise(row.values[i]!)) {
          wrong.push(`THEME.md:${row.line} ${name} says ${row.values[i]} but ${defs[0]!.file} has ${actual}`);
        }
      });
    }
    expect(wrong).toEqual([]);
  });

  it("lists every theme.css setting", () => {
    const documented = new Set(rows.flatMap((row) => row.names));
    const missing = Object.keys(parseCustomProperties(read("src/theme.css"))).filter((name) => !documented.has(name));
    expect(missing).toEqual([]);
  });
});
