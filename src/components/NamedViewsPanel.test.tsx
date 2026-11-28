// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureNamedView, type NamedView, type NamedViewSnapshot } from "../lib/namedViews";
import { NamedViewsPanel, type NamedViewsPanelProps } from "./NamedViewsPanel";

const SNAPSHOT: NamedViewSnapshot = {
  view: { projection: "perspective", corner: "ne", freeRotate: false },
  pose: null,
  tab: "3d",
  drawing: "site",
  analyses: { solar: false, wind: false, view: false },
  solar: { showPath: false, castShadows: false, radiusFactor: 1, year: 2026, month: 6, day: 21, hour: 12, minute: 0 },
  wind: { enabled: false, period: "annual", designWind: null, daypart: "all" },
  windStreaksOn: false,
  windPlan: { mode: "speed", vectorsOn: true, sector: null, view: "map" },
  renderQuality: "high",
  sunDomeSizeM: null,
  viewshed: { eyeM: 1.6, radiusM: 250 },
  sunStudySelected: [],
  display: { primaryView: true, showOutlines: true, showContours3d: true, hideTrees: false },
  colourByUse: false,
  showSource: false,
  hiddenUses: [],
  landmarkLabelsOn: true,
  lineStyles: null,
  exploded: false,
  explodeGapM: null,
  arrows: null,
};

function makeViews(): NamedView[] {
  return [
    captureNamedView("Plaza", SNAPSHOT, { id: "a" })!,
    captureNamedView("Corner", { ...SNAPSHOT, tab: "satellite" }, { id: "b" })!,
  ];
}

function mount(overrides: Partial<NamedViewsPanelProps> = {}) {
  const props: NamedViewsPanelProps = {
    views: makeViews(),
    busy: null,
    warning: null,
    onSave: vi.fn(() => true),
    onRestore: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onExportSelected: vi.fn(),
    onExportAll: vi.fn(),
    windSheetFraming: "whole-site",
    onWindSheetFramingChange: vi.fn(),
    ...overrides,
  };
  render(<NamedViewsPanel {...props} />);
  return props;
}

const WIND_SHEET_SNAPSHOT: NamedViewSnapshot = {
  ...SNAPSHOT,
  view: { projection: "plan", corner: "ne", freeRotate: false },
  analyses: { solar: false, wind: true, view: false },
};

function windSheetViews(): NamedView[] {
  return [...makeViews(), captureNamedView("Wind sheet", WIND_SHEET_SNAPSHOT, { id: "w" })!];
}

afterEach(cleanup);

describe("NamedViewsPanel", () => {
  it("shows a plain empty state and keeps both export buttons off", () => {
    mount({ views: [] });
    expect(screen.getByText(/No saved views for this cut yet/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Export all" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Export selected" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves a trimmed name, clears the field, and ignores a blank name", async () => {
    const user = userEvent.setup();
    const props = mount();
    const field = screen.getByRole("textbox", { name: "View name" }) as HTMLInputElement;
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.type(field, "   ");
    await user.keyboard("{Enter}");
    expect(props.onSave).not.toHaveBeenCalled();
    await user.type(field, "Sun hours");
    await user.click(save);
    expect(props.onSave).toHaveBeenCalledWith("   Sun hours");
    expect(field.value).toBe("");
  });

  it("keeps the typed name when saving fails", async () => {
    const user = userEvent.setup();
    mount({ onSave: vi.fn(() => false) });
    const field = screen.getByRole("textbox", { name: "View name" }) as HTMLInputElement;
    await user.type(field, "Keep me");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(field.value).toBe("Keep me");
  });

  it("restores a view when its name is clicked", async () => {
    const user = userEvent.setup();
    const props = mount();
    await user.click(screen.getByRole("button", { name: /^Plaza/ }));
    expect(props.onRestore).toHaveBeenCalledWith("a");
  });

  it("renames in place with Enter and drops an empty rename", async () => {
    const user = userEvent.setup();
    const props = mount();
    await user.click(screen.getByRole("button", { name: "Rename Plaza" }));
    const field = screen.getByRole("textbox", { name: "New name for Plaza" });
    await user.clear(field);
    await user.type(field, "Forecourt{Enter}");
    expect(props.onRename).toHaveBeenCalledWith("a", "Forecourt");
    await user.click(screen.getByRole("button", { name: "Rename Corner" }));
    const second = screen.getByRole("textbox", { name: "New name for Corner" });
    await user.clear(second);
    await user.keyboard("{Enter}");
    expect(props.onRename).toHaveBeenCalledTimes(1);
  });

  it("asks before deleting", async () => {
    const user = userEvent.setup();
    const props = mount();
    await user.click(screen.getByRole("button", { name: "Delete Plaza" }));
    expect(props.onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete Plaza" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith("a");
  });

  it("exports only the ticked views, and every view for Export all", async () => {
    const user = userEvent.setup();
    const props = mount();
    const selected = screen.getByRole("button", { name: "Export selected" }) as HTMLButtonElement;
    expect(selected.disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "Tick Corner" }));
    expect(selected.disabled).toBe(false);
    await user.click(selected);
    expect(props.onExportSelected).toHaveBeenCalledWith(["b"], false, "whole-site");
    await user.click(screen.getByRole("checkbox", { name: "Tick Corner" }));
    expect(selected.disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Export all" }));
    expect(props.onExportAll).toHaveBeenCalledWith(false, "whole-site");
  });

  it("passes the High quality, transparent toggle through to both exports", async () => {
    const user = userEvent.setup();
    const props = mount();
    const toggle = screen.getByRole("checkbox", { name: "High quality, transparent" }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    await user.click(screen.getByRole("checkbox", { name: "Tick Plaza" }));
    await user.click(screen.getByRole("button", { name: "Export selected" }));
    expect(props.onExportSelected).toHaveBeenCalledWith(["a"], true, "whole-site");
    await user.click(screen.getByRole("button", { name: "Export all" }));
    expect(props.onExportAll).toHaveBeenCalledWith(true, "whole-site");
  });

  it("marks non-3D views as restore only and disables export while busy", () => {
    mount({ busy: "all", warning: "1 view skipped: only 3D views export as PNG." });
    const corner = screen.getByRole("button", { name: /^Corner/ });
    expect(within(corner).getByText(/restore only/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Exporting…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("skipped");
  });

  it("wraps long view names, keeps a tooltip and keeps the export buttons on one line", () => {
    const css = readFileSync(join(__dirname, "..", "floating.css"), "utf8");
    const nameRule = css.match(/\.named-views-panel \.named-views-name \.massing-building-name \{([^}]*)\}/)?.[1] ?? "";
    expect(nameRule).toContain("white-space: normal");
    expect(nameRule).not.toContain("white-space: nowrap");
    expect(nameRule).toContain("text-overflow: clip");
    const buttonRule = css.match(/\.named-views-panel \.named-views-primary \{([^}]*)\}/)?.[1] ?? "";
    expect(buttonRule).toContain("white-space: nowrap");
    expect(buttonRule).toContain("min-width: max-content");
    mount({ views: [captureNamedView("Southbank Isometric Perspective Solar Study", SNAPSHOT, { id: "c" })!] });
    expect(screen.getByTitle("Southbank Isometric Perspective Solar Study")).toBeTruthy();
  });

  it("shows the A3 map framing only when a saved view is a Plan wind sheet", () => {
    mount();
    expect(screen.queryByRole("group", { name: "A3 map framing" })).toBeNull();
    cleanup();
    mount({ views: windSheetViews() });
    const group = screen.getByRole("group", { name: "A3 map framing" });
    expect(within(group).getByRole("button", { name: "Whole site" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "Saved zoom" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("reports the framing choice and passes it to both exports", async () => {
    const user = userEvent.setup();
    const props = mount({ views: windSheetViews(), windSheetFraming: "saved" });
    const group = screen.getByRole("group", { name: "A3 map framing" });
    await user.click(within(group).getByRole("button", { name: "Whole site" }));
    expect(props.onWindSheetFramingChange).toHaveBeenCalledWith("whole-site");
    await user.click(screen.getByRole("checkbox", { name: "Tick Wind sheet" }));
    await user.click(screen.getByRole("button", { name: "Export selected" }));
    expect(props.onExportSelected).toHaveBeenCalledWith(["w"], false, "saved");
    await user.click(screen.getByRole("button", { name: "Export all" }));
    expect(props.onExportAll).toHaveBeenCalledWith(false, "saved");
  });

  it("disables the framing choice while exporting", () => {
    mount({ views: windSheetViews(), busy: "all" });
    const group = screen.getByRole("group", { name: "A3 map framing" });
    for (const button of within(group).getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
