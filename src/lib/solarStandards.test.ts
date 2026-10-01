import { describe, expect, it } from "vitest";
import { SHADOW_STANDARDS, melbourneLocalToUtc, melbourneZoneName, shadowStandardStepLabel } from "./solar";

const YEAR = 2026;

function utcInstants(id: keyof typeof SHADOW_STANDARDS): string[] {
  const { month, day, hours } = SHADOW_STANDARDS[id];
  return hours.map((hour) => melbourneLocalToUtc(YEAR, month, day, hour, 0).toISOString());
}

describe("Victorian shadow-standard presets", () => {
  it("steps ResCode 22 Sep hourly from 9am to 3pm AEST (UTC+10)", () => {
    expect(SHADOW_STANDARDS["rescode-sep"].hours).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(utcInstants("rescode-sep")).toEqual([
      "2026-09-21T23:00:00.000Z",
      "2026-09-22T00:00:00.000Z",
      "2026-09-22T01:00:00.000Z",
      "2026-09-22T02:00:00.000Z",
      "2026-09-22T03:00:00.000Z",
      "2026-09-22T04:00:00.000Z",
      "2026-09-22T05:00:00.000Z",
    ]);
  });

  it("steps winter 22 Jun hourly from 11am to 2pm AEST (UTC+10)", () => {
    expect(SHADOW_STANDARDS["winter-jun-public"].hours).toEqual([11, 12, 13, 14]);
    expect(utcInstants("winter-jun-public")).toEqual([
      "2026-06-22T01:00:00.000Z",
      "2026-06-22T02:00:00.000Z",
      "2026-06-22T03:00:00.000Z",
      "2026-06-22T04:00:00.000Z",
    ]);
  });

  it("labels both sets AEST and counts the steps", () => {
    for (const id of ["rescode-sep", "winter-jun-public"] as const) {
      const { month, day, hours } = SHADOW_STANDARDS[id];
      for (const hour of hours) expect(melbourneZoneName(melbourneLocalToUtc(YEAR, month, day, hour, 0))).toBe("AEST");
    }
    expect(shadowStandardStepLabel("rescode-sep", YEAR, 1)).toBe("22 Sep, 10:00 AEST (2 of 7)");
    expect(shadowStandardStepLabel("winter-jun-public", YEAR, 3)).toBe("22 Jun, 14:00 AEST (4 of 4)");
    expect(melbourneZoneName(melbourneLocalToUtc(YEAR, 12, 21, 12, 0))).toBe("AEDT");
  });
});
