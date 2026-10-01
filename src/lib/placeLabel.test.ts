import { describe, expect, it } from "vitest";
import { aiFilename, fileStem, pngFilename } from "./download";
import { writeFrameSearch } from "./frameQuery";
import {
  addressStillApplies,
  coordinateLabel,
  formatAustralianAddress,
  formatDisplayName,
  formatLocality,
  labelFromGeocoder,
  localityName,
  resolveSearchedCut,
  slugifyPlace,
  type GeocoderAddress,
  type PlaceAnchor,
} from "./placeLabel";
import type { CityModel } from "../types";

const gertrude: GeocoderAddress = {
  house_number: "1-9",
  road: "Gertrude Street",
  suburb: "Fitzroy",
  city_district: "City of Yarra",
  state: "Victoria",
  "ISO3166-2-lvl4": "AU-VIC",
  postcode: "3065",
};

describe("formatAustralianAddress", () => {
  it("formats a ranged house number, street, suburb, state, and postcode", () => {
    expect(formatAustralianAddress(gertrude)).toBe("1–9 Gertrude St, Fitzroy VIC 3065");
    expect(
      formatAustralianAddress({
        house_number: "17-21",
        road: "Smith Street",
        suburb: "Fitzroy",
        state: "Victoria",
        postcode: "3065",
      }),
    ).toBe("17–21 Smith St, Fitzroy VIC 3065");
  });

  it("does not keep only the house number from a comma-led display name", () => {
    const display = "1-9, Gertrude Street, Fitzroy, Melbourne, Victoria, 3065, Australia";
    expect(formatDisplayName(display)).toBe("1–9 Gertrude St, Fitzroy VIC 3065");
    expect(
      labelFromGeocoder({
        name: "1-9",
        display_name: display,
        address: gertrude,
      }),
    ).toBe("1–9 Gertrude St, Fitzroy VIC 3065");
    expect(labelFromGeocoder({ name: "", display_name: display })).toBe(
      "1–9 Gertrude St, Fitzroy VIC 3065",
    );
  });

  it("keeps a place name when the result is not a street address", () => {
    expect(labelFromGeocoder({ name: "Fitzroy", display_name: "Fitzroy, Melbourne, Victoria, Australia" })).toBe(
      "Fitzroy",
    );
  });
});

describe("formatLocality", () => {
  it("prefers suburb, then city district, town, and locality", () => {
    expect(localityName({ suburb: "North Melbourne", city_district: "Hotham Hill", town: "Town", locality: "Loc" })).toBe(
      "North Melbourne",
    );
    expect(formatLocality({ suburb: "North Melbourne", state: "Victoria", postcode: "3051" })).toBe(
      "North Melbourne VIC",
    );
    expect(formatLocality({ city_district: "Hotham Hill", state: "Victoria" })).toBe("Hotham Hill VIC");
    expect(formatLocality({ town: "Kyneton", state: "Victoria" })).toBe("Kyneton VIC");
    expect(formatLocality({ locality: "Somerton", state: "Victoria" })).toBe("Somerton VIC");
    expect(formatLocality({ city: "Melbourne", state: "Victoria" })).toBeNull();
    expect(coordinateLabel(-37.8041, 144.94944)).toBe("-37.8041, 144.9494");
  });
});

describe("addressStillApplies", () => {
  const anchor = { lat: -37.8052929, lon: 144.9746389 };
  const sideM = 1000;

  it("keeps the address within about 50 m and inside the cut", () => {
    const near = { lat: anchor.lat + 30 / 111_132, lon: anchor.lon };
    expect(addressStillApplies(anchor, near, sideM)).toBe(true);
  });

  it("switches once the cut centre is more than about 50 m from the searched point", () => {
    const far = { lat: anchor.lat + 60 / 111_132, lon: anchor.lon };
    expect(addressStillApplies(anchor, far, sideM)).toBe(false);
  });

  it("switches when the searched point sits outside the cut, even under 50 m", () => {
    const outside = { lat: anchor.lat + 30 / 111_132, lon: anchor.lon };
    expect(addressStillApplies(anchor, outside, 40)).toBe(false);
  });
});

describe("resolveSearchedCut", () => {
  const address = "1–9 Gertrude St, Fitzroy VIC 3065";
  const anchor: PlaceAnchor = { lat: -37.8052929, lon: 144.9746389, label: address };
  const melbourne = { lat: -37.8136, lon: 144.9631 };
  const sideM = 1000;

  it("keeps the searched address when Create model runs before the fly leaves Melbourne", () => {
    const cut = resolveSearchedCut(melbourne, anchor, sideM, false);
    expect(cut.label).toBe(address);
    expect(cut.center).toEqual({ lat: anchor.lat, lon: anchor.lon });
    const model = { placeLabel: cut.label, center: cut.center, sideM } as CityModel;
    expect(pngFilename(model)).toBe(
      "citycut-1-9-gertrude-st-fitzroy-vic-3065-37.8053S-144.9746E-1000m.png",
    );
    const share = writeFrameSearch("", {
      lat: cut.center.lat,
      lon: cut.center.lon,
      sideKm: sideM / 1000,
      label: cut.label ?? "",
    });
    const params = new URLSearchParams(share.slice(1));
    expect(params.get("label")).toBe(address);
    expect(params.get("lat")).toBe("-37.80529");
    expect(params.get("lon")).toBe("144.97464");
    expect(params.get("km")).toBe("1");
  });

  it("keeps the address after the fly lands on the point, and after a small pan", () => {
    const landed = resolveSearchedCut(anchor, anchor, sideM, true);
    expect(landed.label).toBe(address);
    const panned = {
      lat: anchor.lat + 30 / 111_132,
      lon: anchor.lon,
    };
    const kept = resolveSearchedCut(panned, anchor, sideM, true);
    expect(kept.label).toBe(address);
    expect(kept.center).toEqual(panned);
  });

  it("drops the address once the landed cut is more than about 50 m from the search", () => {
    const moved = { lat: anchor.lat + 80 / 111_132, lon: anchor.lon };
    const cut = resolveSearchedCut(moved, anchor, sideM, true);
    expect(cut.label).toBeNull();
    expect(cut.center).toEqual(moved);
  });
});

describe("slugifyPlace", () => {
  it("slugifies an address and stays short", () => {
    expect(slugifyPlace("1–9 Gertrude St, Fitzroy VIC 3065")).toBe("1-9-gertrude-st-fitzroy-vic-3065");
    const long = slugifyPlace(
      "100–120 Very Long Boulevard Name, Southbank Business District VIC 3006 extra words",
    );
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long).not.toMatch(/-$/);
    expect(long).toMatch(/^[a-z0-9-]+$/);
    expect(slugifyPlace("Café & Bar")).toBe("cafe-and-bar");
  });

  it("keeps the lat, lon, and size on export file names", () => {
    const model = {
      placeLabel: "1–9 Gertrude St, Fitzroy VIC 3065",
      center: { lat: -37.8052929, lon: 144.9746389 },
      sideM: 1000,
    } as CityModel;
    const stem = "citycut-1-9-gertrude-st-fitzroy-vic-3065-37.8053S-144.9746E-1000m";
    expect(fileStem(model)).toBe(stem);
    expect(pngFilename(model)).toBe(`${stem}.png`);
    expect(aiFilename(model, "view")).toBe(`${stem}-view.ai`);
    expect(aiFilename(model, "site", 500)).toBe(`${stem}-site-1-500.ai`);
    expect(aiFilename(model, "figure", 1000)).toBe(`${stem}-figure-ground-1-1000.ai`);
    expect(`${fileStem(model)}.3dm`).toBe(`${stem}.3dm`);
  });
});
