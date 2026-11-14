import fs from "node:fs";
import path from "node:path";
import { buildBridgePlanFromGlbBuffer } from "../src/lib/storedSiteLayers/bridgePlan.ts";

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "public/site-layers/sydney-rozelle/manifest.json"), "utf8"),
);
const origin = { lon: manifest.origin.lonLat[0], lat: manifest.origin.lonLat[1] };
const buffer = fs.readFileSync(path.join(root, "public/site-layers/sydney-rozelle/anzac-bridge.glb")).buffer;
const zone = 56;
const plan = await buildBridgePlanFromGlbBuffer(buffer, manifest, origin, zone);
const outPath = path.join(root, "public/site-layers/sydney-rozelle/bridge-plan.json");
fs.writeFileSync(outPath, JSON.stringify(plan));
console.log(
  `wrote ${outPath} cables=${plan.cablePartIds.length} pylons=${plan.pylonPartIds.length} lines=${plan.cableLines.length}`,
);