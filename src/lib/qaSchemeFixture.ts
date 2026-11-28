import snapshot from "./__fixtures__/rhino-three-buildings.parsed.json";
import { mgaPlacement, toImportedMassing, type ImportedMassing, type ParsedMassing } from "./massingImport";

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

export function qaSchemeMassing(base: number): ImportedMassing {
  const value = snapshot as ParsedMassingSnapshot;
  const parsed = parsedFromSnapshot(value);
  return toImportedMassing(parsed, {
    id: "qa-scheme",
    name: QA_SCHEME_FILE_NAME,
    fileBytes: value.fileBytes,
    mode: "mga",
    placement: { ...mgaPlacement(parsed), base },
    visible: true,
  });
}
