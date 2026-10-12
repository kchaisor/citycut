import { describe, expect, it } from "vitest";
import {
  COM_TREES_CREDIT,
  COM_TREES_CREDIT_HTML,
  COM_TREES_DATASET_URL,
  comTreesCreditLine,
  comTreesInCut,
} from "./comTreesCredit";
import { COM_BUILDING_HEIGHTS_CREDIT } from "./comBuildingHeightCredit";
import { modelStageCreditHtml } from "./dataCredits";
import type { CityModel } from "../types";

type Trees = Pick<CityModel, "trees">;
const tree = (tier: "com" | "osm" | "vicmap" | "canopy") =>
  ({ x: 0, y: 0, height: 10, canopy: 6, tier }) as unknown as CityModel["trees"][number];

describe("City of Melbourne urban forest credit", () => {
  it("uses the dataset's published title and licence, in the CoM building-heights style", () => {
    expect(COM_TREES_CREDIT).toBe(
      "Trees: Trees, with species and dimensions (Urban Forest) © City of Melbourne, CC BY 4.0",
    );
    expect(COM_BUILDING_HEIGHTS_CREDIT).toMatch(/^Building heights: .+ © City of Melbourne, CC BY 4\.0$/);
    expect(COM_TREES_DATASET_URL).toBe(
      "https://data.melbourne.vic.gov.au/explore/dataset/trees-with-species-and-dimensions-urban-forest/",
    );
  });

  it("only applies when a CoM inventory tree is in the cut", () => {
    const none: Trees = { trees: [tree("osm"), tree("vicmap"), tree("canopy")] };
    const some: Trees = { trees: [tree("osm"), tree("com")] };
    expect(comTreesInCut(none)).toBe(false);
    expect(comTreesCreditLine(none)).toBeNull();
    expect(comTreesInCut({ trees: [] })).toBe(false);
    expect(comTreesInCut(some)).toBe(true);
    expect(comTreesCreditLine(some)).toBe(COM_TREES_CREDIT);
  });

  it("links out in a new tab with noopener, and sits in the viewport footer only when passed", () => {
    expect(COM_TREES_CREDIT_HTML).toContain(`href="${COM_TREES_DATASET_URL}" target="_blank" rel="noopener noreferrer"`);
    expect(COM_TREES_CREDIT_HTML).toContain(
      'href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>',
    );
    const on = modelStageCreditHtml({ windOn: false, satelliteOn: false, comTreesHtml: COM_TREES_CREDIT_HTML });
    const off = modelStageCreditHtml({ windOn: false, satelliteOn: false });
    expect(on).toContain("Trees, with species and dimensions (Urban Forest) © City of Melbourne</a>");
    expect(off).not.toContain("Urban Forest");
    // Before the byline, like the other conditional credits.
    expect(on.indexOf("Urban Forest")).toBeLessThan(on.indexOf("CityCut · Kelvin Chai"));
  });
});
