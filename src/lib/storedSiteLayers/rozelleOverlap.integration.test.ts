import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fetchOvertureBuildingsForCut } from "../overtureBuildings";
import { squareBBox } from "../geo";
import { intersectionAreaM2 } from "../comBuildingHeightsMatch";
import { parseStoredSiteFootprints } from "./footprints";
import {
  hideOvertureBuildingsOverlappingStoredMesh,
  overtureBuildingOverlapsStoredFootprint,
} from "./overlap";
import type { BuildingFeat } from "../../types";

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
      const masks = parsed.footprints.filter((fp) => fp.props.role === "building");
      const leaking = buildings.filter((building) =>
        masks.some((mask) => overtureBuildingOverlapsStoredFootprint(building, mask).overlaps),
      );
      const industrialKept = buildings.filter((b) => b.use === "industrial");
      console.info(
        `[rozelle overlap] overture=${overture.buildings.length} hidden=${hiddenCount} kept=${buildings.length} industrialKept=${industrialKept.length} leak=${leaking.length}`,
      );
      const slabMasks = parsed.footprints.filter((fp) => fp.props.role === "slab");
      const industrialOnSlab = industrialKept.filter((building) =>
        slabMasks.some((mask) => overtureBuildingOverlapsStoredFootprint(building, mask).overlaps),
      );
      const industrialTouch = industrialKept.filter((building) =>
        masks.some((mask) => intersectionAreaM2(building, mask) > 0.01),
      );
      console.info(
        `[rozelle overlap] industrialOnSlab=${industrialOnSlab.length} industrialTouch=${industrialTouch.length}`,
      );
      expect(leaking).toEqual([]);
      expect(industrialTouch).toEqual([]);
    },
    120_000,
  );

  it(
    "drops every non-mesh building that still overlaps a mesh footprint after merge",
    async () => {
      const center = { lon: 151.1832, lat: -33.8677 };
      const sideM = 1000;
      const footprints = JSON.parse(
        readFileSync(path.join(process.cwd(), "public/site-layers/sydney-rozelle/footprints.geojson"), "utf8"),
      );
      const parsed = parseStoredSiteFootprints(footprints, center, sideM, "square");
      const bounds = squareBBox(center, sideM);
      const overture = await fetchOvertureBuildingsForCut(bounds, center, sideM, undefined, "square");
      const hidden = hideOvertureBuildingsOverlappingStoredMesh(overture.buildings, parsed.footprints);
      const meshRows = hidden.buildings.filter((b) => b.storedSiteMesh);
      const merged: BuildingFeat[] = [
        ...hidden.buildings.filter((b) => !b.storedSiteMesh),
        ...parsed.footprints
          .filter((fp) => fp.props.role === "building")
          .map(
            (fp, i): BuildingFeat => ({
              id: -3_000_000 - i,
              ring: fp.ring,
              holes: fp.holes,
              height: fp.props.topZ - fp.props.baseZ,
              use: "unclassified",
              source: "none",
              storedSiteMesh: true,
            }),
          ),
      ];
      const scrubbed = hideOvertureBuildingsOverlappingStoredMesh(
        merged.filter((b) => !b.storedSiteMesh),
        parsed.footprints,
      );
      const finalList = [...scrubbed.buildings, ...meshRows];
      const masks = parsed.footprints.filter((fp) => fp.props.role === "building");
      const dupes = finalList.filter(
        (b) =>
          !b.storedSiteMesh &&
          masks.some((m) => overtureBuildingOverlapsStoredFootprint(b, m).overlaps),
      );
      expect(dupes).toEqual([]);
    },
    120_000,
  );
});
