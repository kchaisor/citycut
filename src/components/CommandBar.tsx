import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { filterCommandTools, parseCommandQuery } from "../lib/commandQuery";
import { COMMAND_TOOL_DEFS } from "../lib/commandTools";
import { getModelKeyboardBridge } from "../lib/modelKeyboardBridge";
import { searchPlaces } from "../lib/nominatim";
import { addSearchHistory, readSearchHistory } from "../lib/searchHistory";
import { viewportIsNarrow } from "../lib/panelCollapse";
import type { PlaceHit } from "../types";

function storageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function CommandBar({
  open,
  onOpenChange,
  onGoToPlace,
  modelToolsEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToPlace: (place: PlaceHit, sideKm: number | null) => void;
  modelToolsEnabled: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const parsed = parseCommandQuery(query);
  const toolMatches = modelToolsEnabled ? filterCommandTools(parsed.placeQuery || query, COMMAND_TOOL_DEFS) : [];
  const placeRows = hits.map((hit) => ({ kind: "place" as const, hit }));
  const toolRows = toolMatches.map((tool) => ({ kind: "tool" as const, tool }));
  const rows = [...placeRows, ...toolRows];
  const canSearch = parsed.placeQuery.trim().length >= 2;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    setSearchError(null);
    setActiveIndex(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !canSearch) {
      setHits([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const places = await searchPlaces(parsed.placeQuery, controller.signal);
        setHits(places);
        setActiveIndex(0);
      } catch (err) {
        if (controller.signal.aborted) return;
        setHits([]);
        setSearchError(err instanceof Error ? "Search is unavailable right now." : "Search failed.");
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, canSearch, parsed.placeQuery]);

  useEffect(() => {
    if (viewportIsNarrow()) return;
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  if (viewportIsNarrow()) return null;

  function choosePlace(hit: PlaceHit) {
    addSearchHistory(storageOrNull(), hit);
    onGoToPlace(hit, parsed.sideKm);
    onOpenChange(false);
  }

  function chooseTool(toolId: string) {
    const tool = COMMAND_TOOL_DEFS.find((entry) => entry.id === toolId);
    const bridge = getModelKeyboardBridge();
    if (!tool || !bridge) return;
    bridge.applyShortcut(tool.action);
    onOpenChange(false);
  }

  function onSubmit() {
    if (rows.length === 0) return;
    const row = rows[Math.min(activeIndex, rows.length - 1)]!;
    if (row.kind === "place") choosePlace(row.hit);
    else chooseTool(row.tool.id);
  }

  if (!open) return null;

  const recent = readSearchHistory(storageOrNull()).slice(0, 4);

  return (
    <div className="command-bar-backdrop" role="presentation" onMouseDown={() => onOpenChange(false)}>
      <div
        className="command-bar hud-card"
        role="dialog"
        aria-label="Command bar"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-bar-field">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
            id={inputId}
            ref={inputRef}
            className="command-bar-input"
            type="search"
            autoComplete="off"
            spellCheck={false}
            placeholder="Jump to a place or tool…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(0, rows.length - 1)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          <kbd className="command-bar-hint mono">Esc</kbd>
        </div>
        <div className="command-bar-results" role="listbox" aria-label="Results">
          {!canSearch && query.trim().length > 0 && parsed.sideKm != null && (
            <p className="command-bar-note">Add a place name before the distance.</p>
          )}
          {canSearch && searching && <p className="command-bar-note">Searching…</p>}
          {canSearch && searchError && <p className="command-bar-note">{searchError}</p>}
          {!canSearch &&
            query.trim().length === 0 &&
            recent.map((hit) => (
              <button
                key={hit.id}
                type="button"
                className="command-bar-row"
                role="option"
                onClick={() => choosePlace(hit)}
              >
                <span>{hit.label}</span>
                <span className="command-bar-row-meta">{hit.detail}</span>
              </button>
            ))}
          {canSearch &&
            hits.map((hit, index) => (
              <button
                key={hit.id}
                type="button"
                className={index === activeIndex ? "command-bar-row is-active" : "command-bar-row"}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => choosePlace(hit)}
              >
                <span>{hit.label}</span>
                <span className="command-bar-row-meta">{hit.detail}</span>
                {parsed.sideKm != null && (
                  <span className="command-bar-row-meta mono">{Math.round(parsed.sideKm * 1000)} m cut</span>
                )}
              </button>
            ))}
          {toolRows.map((row, offset) => {
            const index = placeRows.length + offset;
            return (
              <button
                key={row.tool.id}
                type="button"
                className={index === activeIndex ? "command-bar-row is-active" : "command-bar-row"}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => chooseTool(row.tool.id)}
              >
                <span>{row.tool.label}</span>
                <kbd className="command-bar-row-meta mono">{row.tool.shortcut}</kbd>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
