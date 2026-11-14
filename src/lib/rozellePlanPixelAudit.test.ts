import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const AUDIT_SCRIPT = path.join(process.cwd(), "scripts/audit-rozelle-plan-png.mjs");
const BROKEN_PLAN = path.join(process.cwd(), "scripts/fixtures/rozelle-1km-3d-plan-broken-dac3d62.png");

function auditFile(filePath: string) {
  const stdout = execFileSync("node", [AUDIT_SCRIPT, filePath], { encoding: "utf8" });
  return JSON.parse(stdout) as { metrics: Record<string, number>; passes: { ok: boolean } };
}

describe("rozellePlanPixelAudit", () => {
  it("fails the known-broken dac3d62 3D Plan capture", () => {
    if (!fs.existsSync(BROKEN_PLAN)) return;
    const result = auditFile(BROKEN_PLAN);
    expect(result.passes.ok).toBe(false);
    expect(result.metrics.harbourWaterFrac).toBeLessThan(0.2);
    expect(result.metrics.harbourBeigeFrac).toBeGreaterThan(0.5);
    expect(result.metrics.harbourSpeckleCount).toBeGreaterThan(800);
  });
});