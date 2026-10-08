import type { ExpressionSpecification } from "maplibre-gl";
import { BUILDING_USE_META, BUILDING_USES } from "./buildingUse";
import { getColour } from "./colours";

/** MapLibre `fill-color` expression from enrichment tile `use` property. */
export function buildingUseFillColorExpression(): ExpressionSpecification {
  const pairs: (string | ExpressionSpecification)[] = [];
  for (const use of BUILDING_USES) {
    pairs.push(use, BUILDING_USE_META[use].color);
  }
  return ["match", ["get", "use"], ...pairs, getColour("--building-uniform")] as unknown as ExpressionSpecification;
}
