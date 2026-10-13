// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolarPanel } from "./SolarPanel";
import type { SolarViewSettings } from "./SolarHeliodon";

const settings: SolarViewSettings = {
  showPath: false,
  castShadows: false,
  radiusFactor: 1,
  year: 2026,
  month: 9,
  day: 22,
  hour: 15,
  minute: 0,
};
const site = { lat: -37.8136, lon: 144.9631 };

describe("Sun section", () => {
  afterEach(cleanup);
  it("has one set of controls: the player, no old time/day sliders or old presets", () => {
    render(<SolarPanel embedded settings={settings} onChange={() => undefined} sideM={500} site={site} />);
    expect(screen.getByRole("slider", { name: "Time of day" })).toBeTruthy();
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(screen.queryByText(/Day of year/)).toBeNull();
    expect(screen.queryByText("Equinox 9am")).toBeNull();
    expect(screen.queryByText("Winter solstice 12pm")).toBeNull();
    expect(screen.getByLabelText(/Cast real-time shadows/)).toBeTruthy();
    expect(screen.getByLabelText(/Show sun path/)).toBeTruthy();
    expect(screen.queryByText(/Hours of sun/)).toBeNull();
  });

  it("date presets keep the time; ResCode jumps to 22 Sep 9am with shadows and narrows the scrubber to 9–3", () => {
    const onChange = vi.fn();
    const view = render(<SolarPanel embedded settings={settings} onChange={onChange} sideM={500} site={site} />);
    fireEvent.click(screen.getByRole("radio", { name: "21 Jun" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ month: 6, day: 21, hour: 15, minute: 0 }));
    fireEvent.click(screen.getByRole("radio", { name: "ResCode 22 Sep" }));
    const next = onChange.mock.calls.at(-1)![0] as SolarViewSettings;
    expect(next).toMatchObject({ month: 9, day: 22, hour: 9, minute: 0, castShadows: true });
    view.rerender(<SolarPanel embedded settings={next} onChange={onChange} sideM={500} site={site} />);
    const scrub = screen.getByRole("slider", { name: "Time of day" }) as HTMLInputElement;
    expect([scrub.min, scrub.max]).toEqual(["540", "900"]);
    fireEvent.click(screen.getByRole("button", { name: "Next hour" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hour: 10, minute: 0 }));
  });
});
