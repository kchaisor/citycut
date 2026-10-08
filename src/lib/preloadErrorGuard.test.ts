// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPreloadReloadFlagForTests, installPreloadErrorGuard } from "./preloadErrorGuard";

describe("installPreloadErrorGuard", () => {
  afterEach(() => {
    clearPreloadReloadFlagForTests();
    vi.unstubAllGlobals();
  });

  it("reloads once on vite:preloadError", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    installPreloadErrorGuard();
    window.dispatchEvent(new Event("vite:preloadError"));
    expect(reload).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("vite:preloadError"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
