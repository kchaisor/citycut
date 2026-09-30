import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { NARROW_PANEL_QUERY } from "../lib/panelCollapse";

export type RailItem = {
  id: string;
  label: string;
  icon: ReactNode;
};

function useNarrowRail() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(NARROW_PANEL_QUERY).matches : false,
  );
  useEffect(() => {
    const media = window.matchMedia(NARROW_PANEL_QUERY);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function IconRail({
  items,
  openId,
  onToggle,
  label,
  drawerId,
}: {
  items: RailItem[];
  openId: string | null;
  onToggle: (id: string) => void;
  label: string;
  drawerId: string;
}) {
  const narrow = useNarrowRail();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-rail-item]")];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    const previous = narrow ? "ArrowLeft" : "ArrowUp";
    const next = narrow ? "ArrowRight" : "ArrowDown";
    if (event.key !== previous && event.key !== next && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? buttons[0]
        : event.key === "End"
          ? buttons[buttons.length - 1]
          : buttons[(index + (event.key === next ? 1 : -1) + buttons.length) % buttons.length];
    target?.focus();
  }

  return (
    <div
      className="icon-rail"
      role="toolbar"
      aria-label={label}
      aria-orientation={narrow ? "horizontal" : "vertical"}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={open ? "rail-btn is-open" : "rail-btn"}
            data-rail-item=""
            aria-label={item.label}
            aria-expanded={open}
            aria-controls={drawerId}
            onClick={() => onToggle(item.id)}
          >
            {item.icon}
            <span className="rail-tip" aria-hidden="true">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
