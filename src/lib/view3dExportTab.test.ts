import { describe, expect, it } from "vitest";
import { VIEW3D_EXPORT_TOOLTIP, view3dExportBlocked } from "./view3dExportTab";

describe("view3dExportTab", () => {
  it("blocks PNG and 3D view exports on the Drawing tab", () => {
    expect(view3dExportBlocked("drawing")).toBe(true);
    expect(view3dExportBlocked("3d")).toBe(false);
    expect(VIEW3D_EXPORT_TOOLTIP).toMatch(/3D tab/i);
  });
});
