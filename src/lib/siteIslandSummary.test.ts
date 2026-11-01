import { describe, expect, it } from "vitest";
import { formatSiteIslandSummary } from "./siteIslandSummary";

describe("formatSiteIslandSummary", () => {
  it("formats solar with shade when provided", () => {
    expect(
      formatSiteIslandSummary({
        kind: "solar",
        solar: { month: 6, day: 21, hour: 14, minute: 0, shadePercent: 62 },
      }),
    ).toBe("Jun 21 14:00 · 62% shade");
  });

  it("omits shade when not computed", () => {
    expect(
      formatSiteIslandSummary({
        kind: "solar",
        solar: { month: 6, day: 21, hour: 14, minute: 0, shadePercent: null },
      }),
    ).toBe("Jun 21 14:00");
  });

  it("formats viewshed visible percent", () => {
    expect(
      formatSiteIslandSummary({
        kind: "view",
        view: { walkAt: { index: 0, distanceM: 0, visiblePercent: 34, seenHa: null } },
      }),
    ).toBe("Viewshed 34% visible");
  });

  it("formats walk ripple minutes", () => {
    expect(
      formatSiteIslandSummary({
        kind: "walkRipple",
        walkRipple: { minutes: 10, hasTimes: true },
      }),
    ).toBe("Walk 10 min");
  });
});
