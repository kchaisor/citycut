// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialArrowToolState } from "../lib/diagramArrowsTool";
import type { CityModel } from "../types";
import { DiagramArrowsDrawing } from "./DiagramArrowsDrawing";

afterEach(cleanup);

describe("DiagramArrowsDrawing labels", () => {
  it("renders each label as haloed SVG text", () => {
    const state = initialArrowToolState([
      {
        id: "a",
        points: [[0, 0], [100, 0]],
        style: "dashed",
        colour: "red",
        width: "m",
        heightM: 20,
        label: "Ferry route",
        animation: "none",
        showIn3d: true,
        showInDrawing: true,
      },
    ]);
    const { container } = render(
      <svg>
        <DiagramArrowsDrawing
          model={{ sideM: 1470 } as CityModel}
          state={state}
          dispatch={vi.fn()}
          svgRef={createRef<SVGSVGElement>()}
          viewWidthM={1470}
          viewHeightM={1470}
          hover={null}
        />
      </svg>,
    );
    const text = container.querySelector("text[data-arrow-label='a']")!;
    expect(text.textContent).toBe("Ferry route");
    expect(text.getAttribute("paint-order")).toBe("stroke");
    expect(Number(text.getAttribute("stroke-width"))).toBeGreaterThan(0);
  });
});
