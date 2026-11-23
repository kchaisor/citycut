export const WIND_DAYPART_IDS = ["all", "morning", "afternoon"] as const;

export type WindDaypartId = (typeof WIND_DAYPART_IDS)[number];

export const WIND_MORNING_HOURS = [7, 8, 9, 10, 11, 12] as const;
export const WIND_AFTERNOON_HOURS = [13, 14, 15, 16, 17, 18] as const;

export type WindDaypartInfo = {
  id: WindDaypartId;
  label: string;
  hours: readonly number[] | null;
  windowLabel: string;
  note: string;
};

export const WIND_DAYPARTS: Record<WindDaypartId, WindDaypartInfo> = {
  all: {
    id: "all",
    label: "All day",
    hours: null,
    windowLabel: "All hours",
    note: "All hours, local standard time",
  },
  morning: {
    id: "morning",
    label: "Morning",
    hours: WIND_MORNING_HOURS,
    windowLabel: "6am–12pm",
    note: "6am–12pm, local standard time",
  },
  afternoon: {
    id: "afternoon",
    label: "Afternoon",
    hours: WIND_AFTERNOON_HOURS,
    windowLabel: "12pm–6pm",
    note: "12pm–6pm, local standard time",
  },
};

export const WIND_DAYPART_CARD_NOTE = "6am–12pm · 12pm–6pm · local standard time";

export function isWindDaypartId(value: string | null | undefined): value is WindDaypartId {
  return value === "all" || value === "morning" || value === "afternoon";
}

export function hourInDaypart(hour: number | undefined, daypart: WindDaypartId): boolean {
  if (daypart === "all") return true;
  if (hour == null || !Number.isFinite(hour)) return false;
  const hours = WIND_DAYPARTS[daypart].hours;
  return hours ? hours.includes(hour) : true;
}
