// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

afterEach(() => cleanup());

const items = [
  { id: "summary", label: "Model details", icon: <span>i</span> },
  { id: "exports", label: "Exports", icon: <span>e</span> },
];

describe("sidebar brand bar", () => {
  it("has no top bar chrome classes", () => {
    const { container } = render(
      <Sidebar
        id="panel"
        items={items}
        active="summary"
        collapsed={false}
        title="Model details"
        onSelect={() => undefined}
        onToggleCollapse={() => undefined}
        onHome={() => undefined}
      >
        <p>body</p>
      </Sidebar>,
    );
    expect(container.querySelector(".topbar")).toBeNull();
    expect(container.querySelector(".brand:not(.sidebar-brand)")).toBeNull();
    expect(container.querySelector(".sidebar-brand-bar")).toBeTruthy();
  });

  it("calls onHome from the CityCut brand control", async () => {
    const user = userEvent.setup();
    const onHome = vi.fn();
    render(
      <Sidebar
        id="panel"
        items={items}
        active="summary"
        collapsed={false}
        title="Model details"
        onSelect={() => undefined}
        onToggleCollapse={() => undefined}
        onHome={onHome}
      >
        <p>body</p>
      </Sidebar>,
    );
    await user.click(screen.getByRole("button", { name: "CityCut home" }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it("shows New cut as text when open and as a labelled rail icon when collapsed", async () => {
    const user = userEvent.setup();
    const onNewCut = vi.fn();
    const { rerender } = render(
      <Sidebar
        id="panel"
        items={items}
        active="summary"
        collapsed={false}
        title="Model details"
        onSelect={() => undefined}
        onToggleCollapse={() => undefined}
        onHome={() => undefined}
        showNewCut
        onNewCut={onNewCut}
      >
        <p>body</p>
      </Sidebar>,
    );
    const openBtn = screen.getByRole("button", { name: "New cut" });
    expect(openBtn.className).toContain("sidebar-new-cut");
    expect(openBtn.className).not.toContain("sidebar-new-cut-icon");
    await user.click(openBtn);
    expect(onNewCut).toHaveBeenCalledTimes(1);

    rerender(
      <Sidebar
        id="panel"
        items={items}
        active="summary"
        collapsed
        title="Model details"
        onSelect={() => undefined}
        onToggleCollapse={() => undefined}
        onHome={() => undefined}
        showNewCut
        onNewCut={onNewCut}
      >
        <p>body</p>
      </Sidebar>,
    );
    expect(screen.queryByRole("button", { name: "New cut", hidden: false })).toBeTruthy();
    const iconBtn = screen.getByRole("button", { name: "New cut" });
    expect(iconBtn.className).toContain("sidebar-new-cut-icon");
    expect(iconBtn.getAttribute("aria-label")).toBe("New cut");
    expect(within(iconBtn).getByText("New cut")).toBeTruthy();
    await user.click(iconBtn);
    expect(onNewCut).toHaveBeenCalledTimes(2);

    const onHome = vi.fn();
    rerender(
      <Sidebar
        id="panel"
        items={items}
        active="summary"
        collapsed
        title="Model details"
        onSelect={() => undefined}
        onToggleCollapse={() => undefined}
        onHome={onHome}
        showNewCut
        onNewCut={onNewCut}
      >
        <p>body</p>
      </Sidebar>,
    );
    await user.click(screen.getByRole("button", { name: "CityCut home" }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });
});
