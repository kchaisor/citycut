import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

describe("UI text has no outline or halo (Kelvin)", () => {
  it("no CSS rule gives UI text or icons a text-shadow, text-stroke, drop-shadow glow or stroke paint-order (except hovered .sidebar-brand-name)", () => {
    const offenders: string[] = [];
    for (const file of cssFiles(SRC)) {
      const css = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\.sidebar-brand:hover\s+\.sidebar-brand-name,\s*\.sidebar-brand:focus-visible\s+\.sidebar-brand-name\s*\{[^}]*\}/g, "");
      for (const match of css.matchAll(/text-shadow\s*:\s*([^;}]+)/g)) {
        if (match[1]!.trim() !== "none") offenders.push(`${file}: text-shadow: ${match[1]!.trim()}`);
      }
      for (const match of css.matchAll(/-webkit-text-stroke(?:-width)?\s*:\s*([^;}]+)/g)) {
        if (!/^0(px)?$/.test(match[1]!.trim())) offenders.push(`${file}: -webkit-text-stroke: ${match[1]!.trim()}`);
      }
      for (const match of css.matchAll(/drop-shadow\(([^)]*)\)/g)) {
        offenders.push(`${file}: drop-shadow(${match[1]!.trim()}) (icon/text glow)`);
      }
      for (const match of css.matchAll(/paint-order\s*:\s*([^;}]+)/g)) {
        if (/stroke/.test(match[1]!)) offenders.push(`${file}: paint-order: ${match[1]!.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("gives hovered .sidebar-brand-name a black boundary behind the yellow fill", () => {
    const indexCss = readFileSync(join(SRC, "index.css"), "utf8");
    expect(indexCss).toMatch(/\.sidebar-brand:hover\s+\.sidebar-brand-name[\s\S]*?-webkit-text-stroke:\s*2px\s+var\(--sidebar-text\)/);
    expect(indexCss).toMatch(/\.sidebar-brand:hover\s+\.sidebar-brand-name[\s\S]*?paint-order:\s*stroke\s+fill/);
  });

  it("no inline React style sets a text shadow or stroke", () => {
    const offenders: string[] = [];
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : [],
      );
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      if (/textShadow\s*:|WebkitTextStroke\s*:/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
