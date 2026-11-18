import { describe, expect, it } from "vitest";
import { PARK_SOLAR_RULE_IDS, SOLAR_RULE_REGISTRY, solarRuleDefinition } from "./solarRuleRegistry";

describe("solar rule registry", () => {
  it("registers noAdditional park rules with status notes", () => {
    expect(PARK_SOLAR_RULE_IDS.length).toBe(4);
    for (const id of PARK_SOLAR_RULE_IDS) {
      const rule = SOLAR_RULE_REGISTRY[id];
      expect(rule.kind).toBe("noAdditional");
      expect(rule.statusNote.length).toBeGreaterThan(4);
    }
    expect(solarRuleDefinition("melbourne-c415-ddo8").statusNote).toContain("Minister");
    expect(solarRuleDefinition("sydney-lep617").month).toBe(4);
  });

  it("keeps rescode-b43 in the registry", () => {
    expect(SOLAR_RULE_REGISTRY["rescode-b43"].kind).toBe("b43");
  });
});
