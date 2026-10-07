import { describe, expect, it } from "vitest";
import {
  CITYCUT_BYLINE,
  DATA_CREDIT_BASE,
  DATA_CREDIT_ESRI_SATELLITE,
  DATA_CREDIT_WIND_SUFFIX,
  modelStageCreditHtml,
  plainDataCredit,
} from "./dataCredits";

describe("dataCredits", () => {
  it("uses the consolidated base string with OSM once", () => {
    expect(DATA_CREDIT_BASE).toContain("Overture Maps Foundation");
    expect(DATA_CREDIT_BASE).toContain("OpenStreetMap contributors (ODbL)");
    expect(DATA_CREDIT_BASE.match(/OpenStreetMap/g)?.length).toBe(1);
    expect(DATA_CREDIT_BASE).toContain("Mapterhorn");
    expect(DATA_CREDIT_BASE).toContain("Vicmap");
  });

  it("appends wind and satellite only when requested", () => {
    expect(plainDataCredit({ windOn: false, satelliteOn: false })).toBe(DATA_CREDIT_BASE);
    expect(plainDataCredit({ windOn: true })).toContain(DATA_CREDIT_WIND_SUFFIX.trim());
    expect(plainDataCredit({ satelliteOn: true })).toContain("Esri");
  });

  it("appends PT Vic attribution when exploded axo overlays export is requested", () => {
    expect(plainDataCredit({ explodedAxoOverlaysOn: true })).toContain("Public transport lines and stops");
  });

  it("keeps the CityCut byline on the model stage", () => {
    const html = modelStageCreditHtml({ windOn: false, satelliteOn: false });
    expect(html).toContain(CITYCUT_BYLINE);
    expect(html).toContain("Overture Maps Foundation");
    expect(html).toContain("OpenStreetMap contributors (ODbL)");
    expect(html).not.toContain(DATA_CREDIT_ESRI_SATELLITE.trim());
  });
});
