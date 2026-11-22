import { useLayoutEffect, type RefObject } from "react";
import { envConsoleLanes, rightHudMaxHeight, type HudBox } from "../../lib/rightHudLayout";

const RESYNC_MS = 500;

function box(el: Element | null): HudBox | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
}

function setVar(root: HTMLElement, name: string, value: string | null) {
  if (value == null) {
    if (root.style.getPropertyValue(name)) root.style.removeProperty(name);
  } else if (root.style.getPropertyValue(name) !== value) {
    root.style.setProperty(name, value);
  }
}

export function useRightHudLayout(rootRef: RefObject<HTMLElement | null>, deps: readonly unknown[]) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => sync()) : null;
    const watched = new Set<Element>();
    const watch = (el: Element | null) => {
      if (!el || watched.has(el)) return;
      watched.add(el);
      observer?.observe(el);
    };
    const sync = () => {
      const stackEl = root.querySelector(".right-hud-stack");
      const consoleEl = root.querySelector(".bottom-bar.env-console");
      const railEl = root.querySelector(".left-tool-rail");
      const outlinerEl = root.querySelector(".left-outliner");
      const compassEl = root.querySelector(".studio-compass");
      for (const el of [stackEl, consoleEl, railEl, outlinerEl]) watch(el);
      const stack = box(stackEl);
      const consoleBar = box(consoleEl);
      if (consoleBar) {
        const lanes = envConsoleLanes(window.innerWidth, consoleBar, [box(railEl), box(outlinerEl)], stack);
        setVar(root, "--env-console-lane-left", `${lanes.left}px`);
        setVar(root, "--env-console-lane-right", `${lanes.right}px`);
      } else {
        setVar(root, "--env-console-lane-left", null);
        setVar(root, "--env-console-lane-right", null);
      }
      if (stack) {
        const maxHeight = rightHudMaxHeight(window.innerHeight, stack, [box(consoleEl), box(compassEl)]);
        setVar(root, "--right-hud-max-height", `${maxHeight}px`);
      } else {
        setVar(root, "--right-hud-max-height", null);
      }
    };
    sync();
    const timer = window.setInterval(sync, RESYNC_MS);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("resize", sync);
    };
  }, deps);
}
