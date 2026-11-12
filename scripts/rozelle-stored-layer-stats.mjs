import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/site-layers/sydney-rozelle/manifest.json"), "utf8"),
);
const footprints = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/site-layers/sydney-rozelle/footprints.geojson"), "utf8"),
);

const center = { lon: 151.1832, lat: -33.8677 };
const sideM = 1000;

console.log(
  JSON.stringify(
    {
      manifestId: manifest.id,
      footprintFeatures: footprints.features?.length ?? 0,
      center,
      sideM,
    },
    null,
    2,
  ),
);
