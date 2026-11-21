import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function topBarButton(file: string, className: string): string {
  const source = readFileSync(join(SRC, file), "utf8");
  const start = source.indexOf(`className="${className}"`);
  expect(start).toBeGreaterThan(-1);
  const open = source.lastIndexOf("<button", start);
  const close = source.indexOf("</button>", start);
  return source.slice(open, close);
}

describe("top-bar New cut and Reset view are icon-only (Kelvin, 21 Nov 2026)", () => {
  const buttons: Array<[string, string, string]> = [
    ["components/Sidebar.tsx", "sidebar-new-cut new-cut-pill topbar-compact-icon-btn", "New cut"],
    ["components/model/ModelPageSidebar.tsx", "cam-reset studio-reset-btn topbar-compact-icon-btn", "Reset view"],
  ];

  it.each(buttons)("%s keeps an icon, aria-label and tooltip but no text label", (file, className, name) => {
    const button = topBarButton(file, className);
    expect(button).toContain(`aria-label="${name}"`);
    expect(button).toContain(`title="${name}"`);
    expect(button).toContain('className="topbar-compact-icon"');
    expect(button).not.toContain("topbar-compact-label");
    const icon = button.indexOf('className="topbar-compact-icon"');
    expect(button.slice(button.indexOf("/>", icon) + 2).trim()).toBe("");
  });

  it("no CSS rule hides the compact icon or shows a compact label at any width", () => {
    const css = readFileSync(join(SRC, "floating.css"), "utf8");
    expect(css).not.toMatch(/\.topbar-compact-label/);
    expect(css).not.toMatch(/\.topbar-compact-icon\s*\{\s*display:\s*none/);
  });
});
