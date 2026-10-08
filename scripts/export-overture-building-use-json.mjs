import { writeFileSync } from "node:fs";
import { OSM_BUILDING_USE } from "../src/lib/buildingUse.ts";

writeFileSync(
  "shared/overture-building-use.json",
  `${JSON.stringify(OSM_BUILDING_USE, null, 2)}\n`,
);
