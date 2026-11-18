import { Building2, Download, DraftingCompass, Eye, Footprints, Info, Radar, Sun, Trees, Upload, Wind } from "lucide-react";
import type { IsoCorner } from "../../lib/isoCamera";
import type { SidebarSectionId, SiteAnalysisKind } from "../../lib/sidebarSections";

export type Tab = "3d" | "drawing" | "satellite";

export const SIDEBAR_PANEL_ID = "model-sidebar-panel";
export const RIGHT_SIDEBAR_PANEL_ID = "model-sidebar-right-panel";
export const iconProps = { size: 18, strokeWidth: 1.75, "aria-hidden": true as const };

export const CORNER_LABEL: Record<IsoCorner, string> = {
  ne: "NE",
  nw: "NW",
  se: "SE",
  sw: "SW",
};

export const HEIGHT_TIER_BAR: Record<string, string> = {
  com: "measured",
  lidar: "lidar",
  overture_height: "overture",
  overture_floors: "overture",
  osm_levels: "overture",
  development_floors: "floors",
  zone_default: "estimate",
  real_source_unmatched: "estimate",
  manual: "manual",
};

export const SECTION_ICONS: Record<SidebarSectionId, typeof Info> = {
  summary: Info,
  buildings: Building2,
  trees: Trees,
  drawing: DraftingCompass,
  analysis: Radar,
  import: Upload,
  exports: Download,
};

export const ANALYSIS_ICONS: Record<SiteAnalysisKind, typeof Sun> = {
  solar: Sun,
  wind: Wind,
  view: Eye,
  walkRipple: Footprints,
};