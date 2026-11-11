import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mgaCrs } from "../src/lib/crsZone";
import { buildMassingFixtureBytes } from "../src/lib/massingFixture3dm";

const rozelleSite = { lon: 151.21512, lat: -33.8572 };
const zone = mgaCrs(rozelleSite.lon).zone;

describe("rozelle import fixture file", () => {
  it("writes separate multi-object .3dm for verify:ui", async () => {
    const out =
      process.env.ROZELLE_FIXTURE_PATH ??
      path.join("/opt/cursor/artifacts", "rozelle-import-massing.3dm");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const bytes = await buildMassingFixtureBytes("separate", rozelleSite, zone);
    fs.writeFileSync(out, Buffer.from(bytes));
    expect(bytes.byteLength).toBeGreaterThan(100);
  });
});
