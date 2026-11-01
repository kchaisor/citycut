export const ROAD_STREET_NAME_SOURCE = "Overture transportation";

export function roadStreetNameLabel(name: string | null | undefined): {
  display: string;
  sourceNote: string;
} {
  if (name && name.trim()) {
    return { display: name.trim(), sourceNote: ROAD_STREET_NAME_SOURCE };
  }
  return { display: "—", sourceNote: `No name in ${ROAD_STREET_NAME_SOURCE}` };
}
