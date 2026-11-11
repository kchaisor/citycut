import type { StyleSpecification } from "maplibre-gl";

export function sanitizeMapStyle<T extends StyleSpecification>(style: T): T {
  const out = structuredClone(style) as StyleSpecification & { attribution?: string };
  delete out.attribution;
  if (out.sources) {
    for (const source of Object.values(out.sources)) {
      if (source && typeof source === "object" && "attribution" in source) {
        delete (source as { attribution?: string }).attribution;
      }
    }
  }
  return out as T;
}
