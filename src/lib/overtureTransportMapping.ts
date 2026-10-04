import { roadSpecFromHighway, roadSpecFromRailway, type RoadSpec } from "./roadCatalog";
type SegmentProps = {
  subtype?: string;
  class?: string;
  subclass?: string;
  sources?: unknown;
};

function highwayFromRoadClass(className: string, subclass?: string): string | null {
  if (!className || className === "unknown") return null;
  if (className === "link" && subclass) {
    const link = `${subclass}_link`;
    if (roadSpecFromHighway(link)) return link;
  }
  if (className.endsWith("_link")) return className;
  if (subclass === "link") return `${className}_link`;
  return className;
}

function railwayFromClass(className: string): string | null {
  if (!className || className === "unknown") return null;
  if (className === "standard_gauge") return "rail";
  return className;
}

/** Skip TomTom-only segments with no Overture class (they often render as stray geometry). */
export function skipTomTomSegmentWithoutClass(props: SegmentProps): boolean {
  if (props.class) return false;
  if (typeof props.sources !== "string") return false;
  try {
    const list = JSON.parse(props.sources) as { provider?: string }[];
    if (!Array.isArray(list) || list.length === 0) return false;
    const hasOsm = list.some((entry) => entry.provider?.toLowerCase() === "osm");
    if (hasOsm) return false;
    const tomtomOnly = list.every((entry) => {
      const p = entry.provider?.toLowerCase() ?? "";
      return p.includes("tomtom") || p.includes("microsoft");
    });
    return tomtomOnly;
  } catch {
    return false;
  }
}

export function roadSpecFromOvertureSegment(props: SegmentProps): RoadSpec | null {
  if (skipTomTomSegmentWithoutClass(props)) return null;
  const subtype = String(props.subtype ?? "").toLowerCase();
  const className = String(props.class ?? "").toLowerCase();
  const subclass = props.subclass ? String(props.subclass).toLowerCase() : undefined;
  if (subtype === "water") return null;
  if (subtype === "rail") {
    const railway = railwayFromClass(className);
    return railway ? roadSpecFromRailway(railway) : null;
  }
  if (subtype === "road" || !subtype) {
    const highway = highwayFromRoadClass(className, subclass);
    return highway ? roadSpecFromHighway(highway) : null;
  }
  return null;
}
