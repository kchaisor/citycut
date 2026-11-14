import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const AUDIT_SCRIPT = path.join(process.cwd(), "scripts/audit-rozelle-plan-png.mjs");
const BROKEN_DAC = path.join(process.cwd(), "scripts/fixtures/rozelle-1km-3d-plan-broken-dac3d62.png");
const BROKEN_HEAD = path.join(process.cwd(), "scripts/fixtures/rozelle-1km-3d-plan-broken-2f1ab01.png");

function auditFile(filePath: string) {
  const stdout = execFileSync("node", [AUDIT_SCRIPT, filePath], { encoding: "utf8" });
  return JSON.parse(stdout) as { metrics: Record<string, number>; passes: { ok: boolean } };
}

describe("rozellePlanPixelAudit", () => {
  it("fails the known-broken dac3d62 3D Plan capture", () => {
    if (!fs.existsSync(BROKEN_DAC)) return;
    const result = auditFile(BROKEN_DAC);
    expect(result.passes.ok).toBe(false);
    expect(result.metrics.harbourBeigeFrac).toBeGreaterThan(0.5);
    expect(result.metrics.harbourSpeckleCount).toBeGreaterThan(800);
  });

  it("fails the known-broken 2f1ab01 3D Plan capture", () => {
    if (!fs.existsSync(BROKEN_HEAD)) return;
    const result = auditFile(BROKEN_HEAD);
    expect(result.passes.ok).toBe(false);
    expect(result.metrics.harbourWaterFrac).toBeLessThan(0.75);
  });
});