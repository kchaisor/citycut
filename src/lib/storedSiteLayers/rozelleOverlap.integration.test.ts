import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchOvertureBuildingsForCut } from "../overtureBuildings";
import { squareBBox } from "../geo";
import { parseStoredSiteFootprints } from "./footprints";
import { hideOvertureBuildingsOverlappingStoredMesh } from "./overlap";

describe("rozelle stored site overlap (live Overture)", () => {
  it(
    "reports how many Overture buildings hide for the canonical 1 km cut",
    async () => {
      const center = { lon: 151.1832, lat: -33.8677 };
      const sideM = 1000;
      const footprints = JSON.parse(
        readFileSync(path.join(process.cwd(), "public/site-layers/sydney-rozelle/footprints.geojson"), "utf8"),
      );
      const parsed = parseStoredSiteFootprints(footprints, center, sideM, "square");
      const bounds = squareBBox(center, sideM);
      const overture = await fetchOvertureBuildingsForCut(bounds, center, sideM, undefined, "square");
      const { hiddenCount, buildings } = hideOvertureBuildingsOverlappingStoredMesh(
        overture.buildings,
        parsed.footprints,
      );
      expect(parsed.footprints.filter((fp) => fp.props.role === "building").length).toBeGreaterThan(200);
      expect(hiddenCount).toBeGreaterThan(0);
      expect(buildings.length + hiddenCount).toBe(overture.buildings.length);
      console.info(
        `[rozelle overlap] overture=${overture.buildings.length} hidden=${hiddenCount} kept=${buildings.length}`,
      );
    },
    120_000,
  );
});
