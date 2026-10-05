import { fallbackBuildingHeightM, type FallbackHeightInput } from "./buildingFallbackHeight";
import { clampBuildingHeight, parseLooseNumber, parseMeters } from "./height";

const LEVEL_HEIGHT = 3;

export type OvertureHeightProps = {
  height?: number | string | null;
  num_floors?: number | string | null;
  min_height?: number | string | null;
};

export type OvertureHeightOptions = Partial<Pick<FallbackHeightInput, "footprintAreaM2" | "zoneCode">>;

function taggedHeightM(props: OvertureHeightProps): number | null {
  return (
    (typeof props.height === "number" ? props.height : parseMeters(String(props.height ?? ""))) ?? null
  );
}

function floorCount(props: OvertureHeightProps): number | null {
  const floorsRaw = props.num_floors;
  return typeof floorsRaw === "number"
    ? floorsRaw
    : parseLooseNumber(typeof floorsRaw === "string" ? floorsRaw : undefined);
}

export type OvertureHeightMethod = "height" | "num_floors" | "fallback";

/** Which Overture field supplied the height before zone refinement. */
export function overtureHeightMethod(props: OvertureHeightProps): OvertureHeightMethod {
  const tagged = taggedHeightM(props);
  if (tagged !== null && tagged > 0) return "height";
  const floors = floorCount(props);
  if (floors !== null && floors > 0) return "num_floors";
  return "fallback";
}

/** True when height would come from footprint area and/or planning zone, not Overture tags. */
export function overtureHeightUsesFallback(props: OvertureHeightProps): boolean {
  const tagged = taggedHeightM(props);
  if (tagged !== null && tagged > 0) return false;
  const floors = floorCount(props);
  return floors === null || floors <= 0;
}

/** Height for extrusion before CoM override: Overture height, then floors × storey height, then fallback. */
export function overtureBuildingHeight(
  props: OvertureHeightProps,
  options: OvertureHeightOptions = {},
): number {
  const tagged = taggedHeightM(props);
  if (tagged !== null && tagged > 0) return clampBuildingHeight(tagged);

  const floors = floorCount(props);
  if (floors !== null && floors > 0) return clampBuildingHeight(floors * LEVEL_HEIGHT);

  return clampBuildingHeight(
    fallbackBuildingHeightM({
      footprintAreaM2: options.footprintAreaM2 ?? null,
      zoneCode: options.zoneCode ?? null,
    }),
  );
}

export function overtureMinHeightM(
  props: OvertureHeightProps,
  options: OvertureHeightOptions = {},
): number {
  const raw = props.min_height;
  const parsed =
    typeof raw === "number" ? raw : parseMeters(typeof raw === "string" ? raw : undefined);
  if (parsed === null || parsed <= 0) return 0;
  return Math.min(parsed, overtureBuildingHeight(props, options) - 1);
}

/** CoM wins when supplied; used in tests for the full priority stack. */
export function resolveBuildingHeight(
  props: OvertureHeightProps,
  comHeight?: number | null,
  options: OvertureHeightOptions = {},
): number {
  if (comHeight != null && comHeight > 0) return clampBuildingHeight(comHeight);
  return overtureBuildingHeight(props, options);
}
