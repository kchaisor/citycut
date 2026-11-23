import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingHudPill } from "./LoadingHudPill";

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("LoadingHudPill", () => {
  it("is the landing and intro loading pill, reused for sun hours", () => {
    expect(source("src/App.tsx")).toContain("<LoadingHudPill");
    expect(source("src/App.tsx")).toContain('label="Processing site data & 3D geometry…"');
    expect(source("src/App.tsx")).toContain('stage="PREP"');
    expect(source("src/components/model/ModelPageViewportTabs.tsx")).toContain("<LoadingHudPill");
    expect(source("src/components/SunHoursGroundLegendList.tsx")).toContain("<LoadingHudPill");
  });

  it("renders the same dark pill, yellow dot, track and PREP label as the landing bar", () => {
    const html = renderToStaticMarkup(
      <LoadingHudPill className="is-processing" label="Processing site data & 3D geometry…" stage="PREP" />,
    );
    expect(html).toContain("loading-hud-pill");
    expect(html).toContain("hud-card");
    expect(html).toContain("loading-pulse-dot");
    expect(html).toContain("Processing site data &amp; 3D geometry…");
    expect(html).toContain("loading-prog-track is-indeterminate");
    expect(html).toContain("loading-prog-shimmer");
    expect(html).toContain("loading-prog-pct");
    expect(html).toContain("PREP");
  });

  it("fills the track and shows a percent when progress is known", () => {
    const html = renderToStaticMarkup(
      <LoadingHudPill label="Building 3D site cut · LiDAR + Vicmap…" progress={0.4} />,
    );
    expect(html).toContain("loading-prog-fill");
    expect(html).toContain("width:40%");
    expect(html).toContain("40%");
    expect(html).not.toContain("loading-prog-shimmer");
  });
});
