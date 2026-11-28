import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LandmarkBlock } from "./BuildingHeightPopover";
import type { WikidataLandmark } from "../../shared/wikidataLandmarks.js";

const eureka: WikidataLandmark = {
  qid: "Q1144478",
  name: "Eureka Tower",
  lon: 144.9643,
  lat: -37.8217,
  heightsM: [297.3],
  floorsAboveGround: 91,
  yearBuilt: 2006,
  yearOpened: null,
  architects: [{ qid: "Q5443440", name: "Fender Katsalidis" }],
  styles: [],
  heritage: [],
  wikipedia: "https://en.wikipedia.org/wiki/Eureka_Tower",
};

describe("popover Landmark block", () => {
  it("drops the Name row when it equals the building name and links the Wikidata Q-page", () => {
    const html = renderToStaticMarkup(<LandmarkBlock landmark={eureka} buildingName="Eureka Tower" modelHeightM={297} />);
    expect(html).not.toContain(">Name<");
    expect(html).toContain(">Landmark<");
    expect(html).toContain('href="https://www.wikidata.org/wiki/Q1144478"');
    expect(html).toContain("Wikidata ↗");
    expect(html).toMatch(/class="landmark-row-value is-numeric">297.3 m</);
  });

  it("keeps the Name row when it differs from the building name", () => {
    const html = renderToStaticMarkup(<LandmarkBlock landmark={eureka} buildingName="7 Riverside Quay" modelHeightM={297} />);
    expect(html).toContain(">Name<");
    expect(html).toContain(">Eureka Tower<");
  });
});
