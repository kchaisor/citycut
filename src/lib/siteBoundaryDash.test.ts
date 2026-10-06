import { describe, expect, it } from "vitest";
import { dashSegments, screenPenAttrs } from "./drawingStyle";
import { sitePlanChunks } from "./aiPlan";
import { ensurePropertyBoundaryLinetype } from "./rhinoExport";
import { loadRhino } from "./rhinoExport";
import { model } from "./aiExport.test";

describe("site boundary dash-dot", () => {
  it("parses the four-part property boundary dash from CSS defaults", () => {
    expect(dashSegments("2.4 0.6 0.2 0.6")).toEqual([2.4, 0.6, 0.2, 0.6]);
    const attrs = screenPenAttrs({
      mm: 0.35,
      color: "#D7263D",
      dash: "2.4 0.6 0.2 0.6",
    });
    expect(attrs.strokeDasharray).toContain(" ");
  });

  it("writes dash-dot on the site boundary Illustrator layer", () => {
    const chunks = sitePlanChunks(
      {
        ...model(),
        siteBoundaryLines: [
          [
            [-40, -40],
            [40, -40],
          ],
        ],
      },
      1000,
    );
    const boundary = chunks.find((chunk) => chunk.name === "Site boundary");
    expect(boundary?.paths?.[0]?.dashMm).toEqual([2.4, 0.6, 0.2, 0.6]);
  });

  it("adds a Property boundary linetype in Rhino", async () => {
    const rhino = await loadRhino();
    const doc = new rhino.File3dm();
    try {
      const index = ensurePropertyBoundaryLinetype(rhino, doc);
      expect(index).not.toBeNull();
      const linetype = doc.linetypes().findName("Property boundary");
      expect(linetype?.name).toBe("Property boundary");
      expect(linetype?.segmentCount).toBe(4);
    } finally {
      doc.destroy();
    }
  });
});
