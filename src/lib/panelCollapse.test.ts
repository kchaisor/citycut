import { describe, expect, it } from "vitest";
import { resolvePanelCollapsed } from "./panelCollapse";

describe("resolvePanelCollapsed", () => {
  it("collapses on a narrow viewport when nothing is stored", () => {
    expect(resolvePanelCollapsed(null, true)).toBe(true);
    expect(resolvePanelCollapsed("", true)).toBe(true);
  });

  it("stays expanded on a wide viewport when nothing is stored", () => {
    expect(resolvePanelCollapsed(null, false)).toBe(false);
    expect(resolvePanelCollapsed("", false)).toBe(false);
  });

  it("lets a stored collapsed value win on a wide viewport", () => {
    expect(resolvePanelCollapsed("1", false)).toBe(true);
    expect(resolvePanelCollapsed("true", false)).toBe(true);
  });

  it("lets a stored expanded value win on a narrow viewport", () => {
    expect(resolvePanelCollapsed("0", true)).toBe(false);
    expect(resolvePanelCollapsed("false", true)).toBe(false);
  });

  it("ignores an unrecognised stored value and uses the breakpoint", () => {
    expect(resolvePanelCollapsed("maybe", true)).toBe(true);
    expect(resolvePanelCollapsed("maybe", false)).toBe(false);
  });
});
