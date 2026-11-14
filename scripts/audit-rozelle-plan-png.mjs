#!/usr/bin/env node
import fs from "node:fs";
import {
  auditRozellePlanPngBuffer,
  rozellePlanPixelPasses,
} from "./lib/rozellePlanPixelAudit.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/audit-rozelle-plan-png.mjs <png>");
  process.exit(2);
}
const metrics = auditRozellePlanPngBuffer(fs.readFileSync(file));
const passes = rozellePlanPixelPasses(metrics);
console.log(JSON.stringify({ metrics, passes }));