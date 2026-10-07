import { writeFileSync } from "node:fs";
import { explodedAxoPdf } from "../src/lib/aiPlan.ts";
import { defaultExplodedAxoSettings } from "../src/lib/explodedAxo.ts";

const model = {
  placeLabel: "Test Block",
  center: { lon: 144.9631, lat: -37.8136 },
  sideM: 100,
  layers: { buildings: true, roads: true, waterGreen: true, trees: true },
  buildings: [
    {
      id: 1,
      ring: [
        [-20, -20],
        [20, -20],
        [20, 20],
        [-20, 20],
        [-20, -20],
      ],
      holes: [],
      height: 12,
      use: "residential",
      source: "osm_tag",
    },
  ],
  roads: [{ id: 2, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" }],
  areas: [{ id: 3, ring: [[-45, -45], [-30, -45], [-30, -30], [-45, -30], [-45, -45]], holes: [], kind: "green" }],
  trees: [],
  roadKm: 0.16,
  buildingCapHit: false,
  sourceNote: "test",
};

const bytes = await explodedAxoPdf(model, 1000, defaultExplodedAxoSettings(model.sideM));
writeFileSync("/opt/cursor/artifacts/exploded-axo-test.pdf", bytes);
console.log(`wrote ${bytes.length} bytes`);
