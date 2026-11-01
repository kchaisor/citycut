export const SIGNAL_TRACE_WALK_SPEED_MPS = 1.3;

export type PulseScheduleSource = "estimate" | "ptv-geometry-only";

export type RailPulseSchedule = {
  headwayMin: number;
  source: PulseScheduleSource;
  note: string;
};

export const SIGNAL_TRACE_RAIL_HEADWAY_NOTE =
  "Tram and train pulse spacing uses a labelled default headway (PTV GTFS headways are not in this build; route geometry from PTV metro lines tiles when loaded).";

export function tramPulseSchedule(): RailPulseSchedule {
  return {
    headwayMin: 5,
    source: "estimate",
    note: "Estimated 5 min tram headway (Melbourne metro typical off-peak).",
  };
}

export function heavyRailPulseSchedule(): RailPulseSchedule {
  return {
    headwayMin: 10,
    source: "estimate",
    note: "Estimated 10 min train headway (Melbourne metro typical off-peak).",
  };
}

export function pulseSpacingMetres(headwayMin: number, travelSpeedMps: number): number {
  return Math.max(18, headwayMin * 60 * travelSpeedMps);
}

export const SIGNAL_TRACE_RAIL_TRAVEL_MPS = 8.5;
