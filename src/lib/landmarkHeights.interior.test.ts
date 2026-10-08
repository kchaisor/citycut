import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { fromLocal } from "./geo";
import { landmarkHeightAtPoint, pickBuildingAtPoint } from "./landmarkBuildingPick";
import { resolveLandmarkCut } from "./landmarkHeightPipeline";
import { interiorPoint } from "./useCascade";

describe.skip("interior for building id (dev-only)", () => {
  it("melbourne central tower", () => {
    const snap = JSON.parse(
      readFileSync(fileURLToPath(new URL("./fixtures/landmark-heights-snapshot.json", import.meta.url)), "utf8"),
    );
    const cut = snap.cuts.find((c: { name: string }) => c.name === "Melbourne Central (office tower)");
    const final = resolveLandmarkCut(cut);
    const tower = final.find((b: { id: number }) => b.id === 2052230187);
    const inner = interiorPoint(tower!.ring, tower!.holes);
    const geo = fromLocal(inner, cut.center);
    const h = landmarkHeightAtPoint(tower!, inner);
    const pick = pickBuildingAtPoint(final, geo.lat, geo.lon, cut.center);
    console.info({ lat: geo.lat, lon: geo.lon, h, pickH: pick?.heightM, id: tower!.id });
  });
});
