import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZONE_USE } from "./zoneUseTable";

describe("ZONE_USE table sync", () => {
  it("matches shared/vicmap-zone-use.json", () => {
    const raw = JSON.parse(readFileSync("shared/vicmap-zone-use.json", "utf8")) as Record<string, string>;
    expect(ZONE_USE).toEqual(raw);
  });
});
