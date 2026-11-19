import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const css = readFileSync(join(SRC, "floating.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const sidebar = readFileSync(join(SRC, "components", "Sidebar.tsx"), "utf8");

function rulesFor(selectorPart: RegExp): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => selectorPart.test(match[1]!))
    .map((match) => `${match[1]!.trim()} { ${match[2]!.trim()} }`);
}

describe("model top bar islands (Kelvin, 19 Nov 2026)", () => {
  it("header islands carry no HUD card class", () => {
    for (const island of ["studio-header-left", "studio-header-center", "studio-header-right"]) {
      const tag = sidebar.match(new RegExp(`className="${island}[^"]*"`))?.[0] ?? "";
      expect(tag, island).not.toBe("");
      expect(tag, island).not.toMatch(/hud-card/);
    }
  });

  it("no rule paints a card behind the header islands", () => {
    const offenders = rulesFor(/\.studio-header-(left|center|right)\s*(,|$)/).filter((rule) =>
      /background:\s*var\(--bg-card\)|box-shadow:\s*var\(--shadow-hud\)|backdrop-filter:\s*blur|border:\s*1px/.test(rule),
    );
    expect(offenders).toEqual([]);
  });

  it("has no Drawing-only top bar layout", () => {
    expect(rulesFor(/data-view-tab="drawing"\][^{]*\.(top-bar-|sidebar-brand-bar|topbar-)/)).toEqual([]);
  });
});
