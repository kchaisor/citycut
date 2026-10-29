/**
 * Blast-radius for the Data reliability view (height tier colouring + export layers).
 * Run: npx vite-node scripts/blast-radius-height-reliability.mjs
 */
import { buildCityGroup, disposeObject } from "../src/lib/buildCity.ts";
import { sitePlanChunks } from "../src/lib/aiPlan.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { sitePlanDxf } from "../src/lib/dxfPlan.ts";

function squareModel() {
  return {
    placeLabel: "Test",
    center: { lat: -37.8136, lon: 144.9631 },
    sideM: 200,
    layers: { buildings: true, roads: false, waterGreen: false, trees: false },
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
        height: 24,
        use: "commercial",
        source: "none",
        heightTier: "com",
      },
      {
        id: 2,
        ring: [
          [30, -10],
          [50, -10],
          [50, 10],
          [30, 10],
          [30, -10],
        ],
        holes: [],
        height: 9,
        use: "residential",
        source: "osm_tag",
        heightTier: "overture_height",
      },
    ],
    roads: [],
    areas: [],
    trees: [],
  };
}

const model = squareModel();
const colourMode = {
  colourByUse: false,
  uniformBuildings: false,
  colourBySource: false,
  colourByHeightReliability: true,
};

const defaultPlan = planPaths(model, undefined, undefined, 1000, undefined, undefined, {
  buildingColour: { colourByUse: true, uniformBuildings: false, colourBySource: false },
});
const reliabilityPlan = planPaths(model, undefined, undefined, 1000, undefined, undefined, {
  buildingColour: colourMode,
});

const defaultCity = buildCityGroup(model, { uniformBuildings: false, colourBySource: false });
const reliabilityCity = buildCityGroup(model, { colourByHeightReliability: true });

const defaultChunks = sitePlanChunks(model, 1000, undefined, {
  uniformBuildings: false,
  colourBySource: false,
  heliodon: null,
  shadows: null,
});
const reliabilityChunks = sitePlanChunks(model, 1000, undefined, {
  colourByHeightReliability: true,
  heliodon: null,
  shadows: null,
});
const dxf = sitePlanDxf(model, 1000, undefined, { colourByHeightReliability: true });

disposeObject(defaultCity);
disposeObject(reliabilityCity);

const defaultFill = defaultPlan.buildings[0]?.fill ?? "";
const surveyedFill = reliabilityPlan.buildings.find((b) => b.heightReliabilityLayer === "CC_Height_Surveyed")?.fill ?? "";
const osmFill = reliabilityPlan.buildings.find((b) => b.heightReliabilityLayer === "CC_Height_OSM")?.fill ?? "";

console.log(
  JSON.stringify({
    defaultBuildingFills: defaultPlan.buildings.map((b) => b.fill),
    reliabilityLayers: reliabilityPlan.buildings.map((b) => b.heightReliabilityLayer),
    surveyedFill,
    osmFill,
    fillsDiffer: surveyedFill !== defaultFill && osmFill !== surveyedFill,
    chunkNamesDefault: defaultChunks.map((c) => c.name),
    chunkNamesReliability: reliabilityChunks.map((c) => c.name),
    dxfHasLayers: dxf.includes("CC_Height_Surveyed") && dxf.includes("CC_Height_OSM"),
  }),
);
