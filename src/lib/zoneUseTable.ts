import type { BuildingUse } from "../types";
import zoneTable from "../../shared/vicmap-zone-use.json";

/** Shared with pipeline via `shared/vicmap-zone-use.json` (kept in sync by tests). */
export const ZONE_USE: Record<string, BuildingUse> = zoneTable as Record<string, BuildingUse>;
