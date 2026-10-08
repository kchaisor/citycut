import overtureBuildingUseTable from "../../shared/overture-building-use.json";
import zoneUseTable from "../../shared/vicmap-zone-use.json";
import type { EnrichmentManifest } from "./buildingEnrichmentTiles";

function canonicalJson(value: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify(sorted);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

let cachedAppHashes: Promise<{ zoneUseTableSha256: string; overtureBuildingUseSha256: string }> | null =
  null;

export function appEnrichmentTableHashes(): Promise<{
  zoneUseTableSha256: string;
  overtureBuildingUseSha256: string;
}> {
  if (!cachedAppHashes) {
    cachedAppHashes = Promise.all([
      sha256Hex(canonicalJson(zoneUseTable)),
      sha256Hex(canonicalJson(overtureBuildingUseTable)),
    ]).then(([zoneUseTableSha256, overtureBuildingUseSha256]) => ({
      zoneUseTableSha256,
      overtureBuildingUseSha256,
    }));
  }
  return cachedAppHashes;
}

export async function manifestMatchesAppTables(manifest: EnrichmentManifest | null): Promise<boolean> {
  if (!manifest?.zoneUseTableSha256 || !manifest.overtureBuildingUseSha256) return false;
  const app = await appEnrichmentTableHashes();
  return (
    manifest.zoneUseTableSha256 === app.zoneUseTableSha256 &&
    manifest.overtureBuildingUseSha256 === app.overtureBuildingUseSha256
  );
}
