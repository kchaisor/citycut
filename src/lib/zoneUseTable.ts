import type { BuildingUse } from "../types";
import zoneTable from "../../shared/vicmap-zone-use.json";

export const ZONE_USE: Record<string, BuildingUse> = zoneTable as Record<string, BuildingUse>;
