import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { modelStageCreditHtml } from "./dataCredits";
import { COM_TREES_CREDIT_HTML } from "./comTreesCredit";

const SRC = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Every <a ...> opening tag with an href, in JSX or HTML strings. */
function anchorTags(text: string): string[] {
  return text.match(/<a\s[^>]*href=[^>]*>/g) ?? [];
}

function bad(tag: string): boolean {
  return !/target=(["{]?)_blank|target="_blank"|\{\.\.\.linkProps\}/.test(tag) ||
    (!/rel="[^"]*noopener/.test(tag) && !tag.includes("{...linkProps}"));
}

describe("credit links open in a new tab", () => {
  it("every anchor in src has target=_blank and rel noopener", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      for (const tag of anchorTags(readFileSync(file, "utf8"))) {
        if (bad(tag)) offenders.push(`${file}: ${tag}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("rendered stage credit HTML links all open in a new tab", () => {
    const html = modelStageCreditHtml({
      windOn: true,
      satelliteOn: true,
      comHeightsHtml: null,
      comTreesHtml: COM_TREES_CREDIT_HTML,
      contourHtml: null,
    });
    const tags = anchorTags(html);
    expect(tags.length).toBeGreaterThan(2);
    for (const tag of tags) {
      expect(tag).toContain('target="_blank"');
      expect(tag).toMatch(/rel="[^"]*noopener/);
    }
  });
});
