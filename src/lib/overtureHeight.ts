import { clampBuildingHeight, parseLooseNumber, parseMeters } from "./height";

const LEVEL_HEIGHT = 3;
const DEFAULT_HEIGHT = 9;

export type OvertureHeightProps = {
  height?: number | string | null;
  num_floors?: number | string | null;
  min_height?: number | string | null;
};

/** Height for extrusion before CoM override: Overture height, then floors × storey height, then default. */
export function overtureBuildingHeight(props: OvertureHeightProps): number {
  const tagged =
    (typeof props.height === "number" ? props.height : parseMeters(String(props.height ?? ""))) ??
    null;
  if (tagged !== null && tagged > 0) return clampBuildingHeight(tagged);

  const floorsRaw = props.num_floors;
  const floors =
    typeof floorsRaw === "number"
      ? floorsRaw
      : parseLooseNumber(typeof floorsRaw === "string" ? floorsRaw : undefined);
  if (floors !== null && floors > 0) return clampBuildingHeight(floors * LEVEL_HEIGHT);

  return DEFAULT_HEIGHT;
}

export function overtureMinHeightM(props: OvertureHeightProps): number {
  const raw = props.min_height;
  const parsed =
    typeof raw === "number" ? raw : parseMeters(typeof raw === "string" ? raw : undefined);
  if (parsed === null || parsed <= 0) return 0;
  return Math.min(parsed, overtureBuildingHeight(props) - 1);
}

/** CoM wins when supplied; used in tests for the full priority stack. */
export function resolveBuildingHeight(
  props: OvertureHeightProps,
  comHeight?: number | null,
): number {
  if (comHeight != null && comHeight > 0) return clampBuildingHeight(comHeight);
  return overtureBuildingHeight(props);
}
