import { overtureBuildingHeight } from "./overtureHeight";

export type OvertureSourceMeta = {
  microsoft: boolean;
  osmWayIds: number[];
};

type SourceEntry = {
  provider?: string;
  dataset?: string;
  record_id?: string;
};

function osmWayIdFromRecordId(recordId: string): number | null {
  const match = /^w(\d+)(?:@\d+)?$/i.exec(recordId.trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

export function parseOvertureSources(raw: unknown): OvertureSourceMeta {
  if (typeof raw !== "string") return { microsoft: false, osmWayIds: [] };
  try {
    const list = JSON.parse(raw) as SourceEntry[];
    if (!Array.isArray(list)) return { microsoft: false, osmWayIds: [] };
    const osmWayIds: number[] = [];
    let microsoft = false;
    for (const entry of list) {
      if (
        entry.provider?.toLowerCase() === "microsoft" ||
        entry.dataset?.toLowerCase().includes("microsoft")
      ) {
        microsoft = true;
      }
      if (typeof entry.record_id === "string") {
        const wayId = osmWayIdFromRecordId(entry.record_id);
        if (wayId !== null) osmWayIds.push(wayId);
      }
    }
    return { microsoft, osmWayIds: [...new Set(osmWayIds)] };
  } catch {
    return { microsoft: false, osmWayIds: [] };
  }
}

export function pickTallestOvertureProps(parts: { props: Record<string, unknown> }[]): Record<string, unknown> {
  if (parts.length === 0) return {};
  let best = parts[0].props;
  let bestHeight = overtureBuildingHeight(best);
  for (const part of parts.slice(1)) {
    const height = overtureBuildingHeight(part.props);
    if (height > bestHeight) {
      bestHeight = height;
      best = part.props;
    }
  }
  return best;
}
