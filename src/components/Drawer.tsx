import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronsLeft } from "lucide-react";

function isHidden(node: HTMLElement): boolean {
  return node.closest("[hidden]") !== null;
}

function firstFocusable(root: HTMLElement): HTMLElement | null {
  const marked = [...root.querySelectorAll<HTMLElement>("[data-autofocus]")].find((node) => !isHidden(node));
  if (marked) return marked;
  const next = [
    ...root.querySelectorAll<HTMLElement>(
      ".drawer-body button, .drawer-body input, .drawer-body select, .drawer-body textarea, .drawer-body a[href]",
    ),
  ].find((node) => !isHidden(node));
  return next ?? root.querySelector<HTMLElement>(".drawer-head button");
}

export function Drawer({
  id,
  open,
  title,
  onClose,
  children,
}: {
  id: string;
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const sawMount = useRef(false);

  useEffect(() => {
    if (!sawMount.current) {
      sawMount.current = true;
      return;
    }
    if (!open) {
      const back = restoreRef.current;
      restoreRef.current = null;
      if (back && document.contains(back)) back.focus();
      return;
    }
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.hasAttribute("data-rail-item")) {
      restoreRef.current = active;
    } else if (!restoreRef.current && active instanceof HTMLElement && active !== panelRef.current) {
      restoreRef.current = active;
    }
    const node = panelRef.current;
    if (!node) return;
    const target = firstFocusable(node);
    target?.focus();
  }, [open, title]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      ref={panelRef}
      id={id}
      className="drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      hidden={!open}
      tabIndex={-1}
    >
      <div className="drawer-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="chevron-btn" aria-label={`Collapse ${title}`} onClick={onClose}>
          <ChevronsLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </div>
  );
}
