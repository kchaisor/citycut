// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolarPanel } from "./SolarPanel";
import { parseClock } from "./SunStudyPlayer";
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
    fireEvent.click(screen.getByRole("radio", { name: "ResCode Open Space" }));
    const next = onChange.mock.calls.at(-1)![0] as SolarViewSettings;
    expect(next).toMatchObject({ month: 9, day: 22, hour: 9, minute: 0, castShadows: true });
    view.rerender(<SolarPanel embedded settings={next} onChange={onChange} sideM={500} site={site} />);
    const scrub = screen.getByRole("slider", { name: "Time of day" }) as HTMLInputElement;
    expect([scrub.min, scrub.max]).toEqual(["540", "900"]);
    fireEvent.click(screen.getByRole("button", { name: "Next hour" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hour: 10, minute: 0 }));
  });

  it("shows labelled key-date cards (21 Jun, 22 Sep, 22 Dec) and the two presets with their why", () => {
    render(<SolarPanel embedded settings={settings} onChange={() => undefined} sideM={500} site={site} />);
    for (const name of ["21 Jun", "22 Sep", "22 Dec"]) expect(screen.getByRole("radio", { name })).toBeTruthy();
    expect(screen.getByText("Winter solstice")).toBeTruthy();
    expect(screen.getByText("Summer solstice")).toBeTruthy();
    // ResCode card on three lines; no full stops, no "common practice".
    expect(screen.getByText("ResCode Open Space")).toBeTruthy();
    expect(screen.getByText("22 Sep 9am – 3pm")).toBeTruthy();
    expect(screen.getByText("Clause 55.04-3 (B4-3)")).toBeTruthy();
    expect(screen.getByText("22 Jun 11am – 2pm")).toBeTruthy();
    const presets = screen.getByRole("radiogroup", { name: "Victorian shadow standards" }).textContent ?? "";
    expect(presets).not.toMatch(/common practice/i);
    expect(presets.replace(/\d\.\d/g, "")).not.toContain(".");
  });

  it("a key date shows hour buttons 9–3 with prev/next; the selected hour is pressed", () => {
    const onChange = vi.fn();
    const keyDay = { ...settings, month: 6, day: 21, hour: 11, minute: 0 };
    const view = render(<SolarPanel embedded settings={keyDay} onChange={onChange} sideM={500} site={site} />);
    const group = screen.getByRole("group", { name: "Hour on the key date" });
    const hours = Array.from(group.querySelectorAll(".solar-hour")).map((b) => b.textContent);
    expect(hours).toEqual(["9", "10", "11", "12", "1", "2", "3"]);
    const pressed = Array.from(group.querySelectorAll('.solar-hour[aria-pressed="true"]')).map((b) => b.textContent);
    expect(pressed).toEqual(["11"]);
    fireEvent.click(screen.getByRole("button", { name: "Next hour" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ month: 6, day: 21, hour: 12, minute: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "Previous hour" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hour: 10, minute: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ hour: 14, minute: 0 }));
    view.rerender(<SolarPanel embedded settings={{ ...keyDay, hour: 15 }} onChange={onChange} sideM={500} site={site} />);
    expect((screen.getByRole("button", { name: "Next hour" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("no hour buttons on a date that is not a key date", () => {
    render(<SolarPanel embedded settings={{ ...settings, month: 3, day: 5 }} onChange={() => undefined} sideM={500} site={site} />);
    expect(screen.queryByRole("group", { name: "Hour on the key date" })).toBeNull();
  });

  it("presets and toggles only change sun settings, never anything else", () => {
    const onChange = vi.fn();
    render(<SolarPanel embedded settings={settings} onChange={onChange} sideM={500} site={site} />);
    fireEvent.click(screen.getByRole("radio", { name: "Public Spaces" }));
    fireEvent.click(screen.getByRole("radio", { name: "22 Dec" }));
    fireEvent.click(screen.getByLabelText(/Show sun path/));
    fireEvent.click(screen.getByLabelText(/Cast real-time shadows/));
    for (const [next] of onChange.mock.calls) expect(Object.keys(next).sort()).toEqual(Object.keys(settings).sort());
  });

  it("typed time: parses HH:MM, rejects junk, snaps into the slider range", () => {
    expect(parseClock("9:30")).toBe(570);
    expect(parseClock("0930")).toBe(570);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("abc")).toBeNull();
    const onChange = vi.fn();
    render(<SolarPanel embedded settings={settings} onChange={onChange} sideM={500} site={site} />);
    fireEvent.click(screen.getByRole("button", { name: /click to type/ }));
    const input = screen.getByRole("textbox", { name: "Type time (HH:MM)" });
    fireEvent.change(input, { target: { value: "03:00" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const snapped = onChange.mock.calls.at(-1)![0] as SolarViewSettings;
    const scrub = screen.getByRole("slider", { name: "Time of day" }) as HTMLInputElement;
    expect(snapped.hour * 60 + snapped.minute).toBe(Number(scrub.min));
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /click to type/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Type time (HH:MM)" }), { target: { value: "99:99" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Type time (HH:MM)" }), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("playing sun sweep does not overwrite a concurrent Show sun path & compass toggle before re-render", () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    const cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    try {
      const onChange = vi.fn();
      render(<SolarPanel embedded settings={settings} onChange={onChange} sideM={500} site={site} />);
      fireEvent.click(screen.getByRole("button", { name: "Play sun sweep" }));
      // Toggle Show sun path & compass before the parent re-renders or the next rAF tick runs
      fireEvent.click(screen.getByLabelText(/Show sun path/));
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ showPath: true, castShadows: true }));
      const tick = rafCallbacks.at(-1);
      expect(tick).toBeTypeOf("function");
      tick!(performance.now() + 100);
      const last = onChange.mock.calls.at(-1)![0] as SolarViewSettings;
      expect(last.showPath).toBe(true);
    } finally {
      rafSpy.mockRestore();
      cafSpy.mockRestore();
    }
  });
});
