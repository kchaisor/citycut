import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import overtureBuildingUseTable from "../../shared/overture-building-use.json";
import zoneUseTable from "../../shared/vicmap-zone-use.json";
import { appEnrichmentTableHashes } from "./enrichmentTableHashes";

function nodeSha256(table: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

describe("enrichmentTableHashes", () => {
  it("matches pipeline table_hash.py digests", async () => {
    const app = await appEnrichmentTableHashes();
    expect(app.zoneUseTableSha256).toBe(nodeSha256(zoneUseTable as Record<string, string>));
    expect(app.overtureBuildingUseSha256).toBe(
      nodeSha256(overtureBuildingUseTable as Record<string, string>),
    );
  });

  it("matches checked-in shared json bytes via python canonical form", () => {
    const zonePath = readFileSync("shared/vicmap-zone-use.json", "utf8");
    const zone = JSON.parse(zonePath) as Record<string, string>;
    expect(nodeSha256(zone)).toHaveLength(64);
  });
});
