// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HeliodonPlanOverlay } from "./HeliodonPlanOverlay";

const input = { lat: -37.8045, lon: 145.0215, year: 2026, month: 9, day: 22, hour: 15, minute: 0, sideM: 1000 };
const date = { lat: input.lat, lon: input.lon, year: 2026, month: 9, day: 22 };

function draw(sunStudy: typeof date | null) {
  return render(
    <svg>
      <HeliodonPlanOverlay input={input} planScale={1000} sideM={1000} sunStudy={sunStudy} />
    </svg>,
  ).container;
}

afterEach(cleanup);

describe("HeliodonPlanOverlay sun study", () => {
  it("draws one sun per hour 9am–3pm and hides the current-time disc", () => {
    const off = draw(null);
    expect(off.querySelectorAll("[data-sun-hour]").length).toBe(0);
    const offDiscs = off.querySelectorAll("circle[r]").length;
    const offNoonLabels = [...off.querySelectorAll("text")].filter((t) => t.textContent === "12h").length;
    cleanup();
    const on = draw(date);
    const suns = [...on.querySelectorAll("[data-sun-hour]")];
    expect(suns.map((g) => g.getAttribute("data-sun-hour"))).toEqual(["9", "10", "11", "12", "13", "14", "15"]);
    expect(suns.map((g) => g.querySelector("text")!.textContent)).toEqual(["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm"]);
    for (const g of suns) expect(g.querySelector("circle")!.getAttribute("fill")!.toLowerCase()).toBe("#fff500");
    const texts = [...on.querySelectorAll("text")].map((t) => t.textContent);
    expect(offNoonLabels).toBe(3);
    expect(texts.filter((t) => t === "12h").length).toBe(2);
    expect(offDiscs).toBeGreaterThan(0);
  });
});
