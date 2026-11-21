import snapshot from "./__fixtures__/rhino-three-buildings.parsed.json";
import { cutCentrePlacement, toImportedMassing, type ImportedMassing, type ParsedMassing } from "./massingImport";
import type { LonLat } from "../types";

export const QA_SCHEME_FILE_NAME = "rhino-three-buildings.3dm";

export type ParsedMassingSnapshot = Omit<ParsedMassing, "positions" | "indices"> & {
  fileBytes: number;
  positions: number[];
  indices: number[];
};

export function parsedMassingSnapshot(parsed: ParsedMassing, fileBytes: number): ParsedMassingSnapshot {
  return {
    ...parsed,
    fileBytes,
    positions: Array.from(parsed.positions),
    indices: Array.from(parsed.indices),
  };
}

export function parsedFromSnapshot(value: ParsedMassingSnapshot): ParsedMassing {
  const { fileBytes: _fileBytes, ...rest } = value;
  return { ...rest, positions: new Float32Array(value.positions), indices: new Uint32Array(value.indices) };
}

export function qaSchemeMassing(center: LonLat, zone: number, base: number): ImportedMassing {
  const value = snapshot as ParsedMassingSnapshot;
  return toImportedMassing(parsedFromSnapshot(value), {
    id: "qa-scheme",
    name: QA_SCHEME_FILE_NAME,
    fileBytes: value.fileBytes,
    mode: "click",
    placement: cutCentrePlacement({ center }, zone, base),
    visible: true,
  });
}
