import { useEffect, useId, useRef, useState } from "react";
import { Copy, Search, X } from "lucide-react";
import { MAX_SIDE_KM, MIN_SIDE_KM } from "../content/constants";
import { CRS_NOTE, mgaCrs } from "../lib/crs";
import { formatCoord, formatKmSide } from "../lib/geo";
import { searchPlaces } from "../lib/nominatim";
import { addSearchHistory, clearSearchHistory, readSearchHistory } from "../lib/searchHistory";
import type { PlaceHit, SiteFrameShape, UiLayers } from "../types";
import { Mark } from "./Mark";

const SIDE_PRESETS_KM = [0.25, 0.5, 1, 2] as const;

function formatPresetKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

const DEFAULT_QUICK_PLACES: PlaceHit[] = [
  {
    id: "preset-east-melbourne",
    label: "East Melbourne",
    detail: "Victoria, Australia",
    lat: -37.8125,
    lon: 144.9785,
    bounds: null,
  },
  {
    id: "preset-mont-albert-north",
    label: "Mont Albert North",
    detail: "Victoria, Australia",
    lat: -37.8045,
    lon: 145.1065,
    bounds: null,
  },
  {
    id: "preset-southbank",
    label: "Southbank",
    detail: "Victoria, Australia",
    lat: -37.8228,
    lon: 144.9643,
    bounds: null,
  },
  {
    id: "preset-fitzroy",
    label: "Fitzroy",
    detail: "Victoria, Australia",
    lat: -37.7984,
    lon: 144.9784,
    bounds: null,
  },
];

const LAYER_ITEMS: {
  key: keyof UiLayers;
  label: string;
  shortLabel: string;
}[] = [
  { key: "buildings", label: "Buildings", shortLabel: "Buildings" },
  { key: "roads", label: "Roads and rail", shortLabel: "Roads & rail" },
  { key: "terrain", label: "Terrain", shortLabel: "Terrain" },
  { key: "contours", label: "Contours", shortLabel: "Contours" },
  { key: "waterGreen", label: "Water and green", shortLabel: "Water & green" },
  { key: "trees", label: "Trees", shortLabel: "Trees" },
];

/** window.localStorage, or null where storage is blocked (private mode, tests without a DOM). */
function storageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function SelectChrome({
  placeLabel,
  sideKm,
  layers,
  loading,
  error,
  onSideKm,
  frameShape,
  onFrameShape,
  onLayer,
  onPlace,
  onCreate,
  basemap,
  onBasemap,
  center,
  onHome,
}: {
  center: { lat: number; lon: number };
  basemap: "map" | "satellite";
  onBasemap: (b: "map" | "satellite") => void;
  placeLabel: string;
  sideKm: number;
  layers: UiLayers;
  loading: boolean;
  error: string | null;
  onSideKm: (km: number) => void;
  frameShape: SiteFrameShape;
  onFrameShape: (shape: SiteFrameShape) => void;
  onLayer: (key: keyof UiLayers, on: boolean) => void;
  onPlace: (place: PlaceHit) => void;
  onCreate: () => void;
  onHome: () => void;
}) {
  const sliderId = useId();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null as string | null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [recent, setRecent] = useState<PlaceHit[]>(() => readSearchHistory(storageOrNull()));
  const [dismissedPresets, setDismissedPresets] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const area =
    frameShape === "circle" ? Math.PI * (sideKm / 2) ** 2 : sideKm * sideKm;
  const sideM = Math.round(sideKm * 1000);
  const crs = mgaCrs(center.lon);
  const crsStatePrefix = crs.zone === 56 ? "NSW" : "VIC";
  const crsTagText =
    crs.epsg != null
      ? `${crsStatePrefix} · EPSG:${crs.epsg}`
      : `GDA2020 · MGA${crs.zone}`;
  const activeLayerCount = LAYER_ITEMS.filter((item) => layers[item.key]).length;
  const sliderPct = Math.min(
    100,
    Math.max(0, ((sideKm - MIN_SIDE_KM) / (MAX_SIDE_KM - MIN_SIDE_KM)) * 100),
  );

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
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
        const places = await searchPlaces(text, controller.signal);
        setHits(places);
        setResultsOpen(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        setHits([]);
        setSearchError(
          err instanceof Error
            ? "Search is unavailable right now."
            : "Search failed.",
        );
        setResultsOpen(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node))
        setResultsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(hit: PlaceHit) {
    setRecent(addSearchHistory(storageOrNull(), hit));
    onPlace(hit);
    setQuery(hit.label);
    setResultsOpen(false);
  }

  return (
    <div className="select-chrome">
      {/* 1. Top-Left Brand + CRS Pill */}
      <div className="sidebar-brand-bar top-left-brand landing-brand-pill hud-surface">
        <button className="sidebar-brand" type="button" onClick={onHome} aria-label="CityCut home">
          <span className="sidebar-brand-mark brand-mark">
            <Mark />
          </span>
          <span className="sidebar-brand-name brand-name">CityCut</span>
        </button>
        <span className="v-sep" aria-hidden="true" />
        <span className="crs-tag landing-crs-badge mono" title={CRS_NOTE}>
          {crsTagText}
        </span>
      </div>

      {/* 2. Top-Center Floating Omnibox + Recent / Quick Chips */}
      <div className="omnibox-stack landing-omnibox-wrap" ref={boxRef}>
        <div className="search omnibox landing-omnibox hud-surface">
          <Search className="search-icon" size={15} strokeWidth={2.2} aria-hidden="true" />
          <label className="sr-only" htmlFor={searchId}>
            Search a place
          </label>
          <input
            id={searchId}
            className="omnibox-input"
            value={query}
            placeholder="Search a city, address, or place"
            autoComplete="off"
            role="combobox"
            aria-expanded={resultsOpen}
            aria-controls="place-results"
            data-autofocus="true"
            onChange={(event) => {
              setQuery(event.target.value);
              setResultsOpen(true);
            }}
            onFocus={() => setResultsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && hits[0]) {
                event.preventDefault();
                choose(hits[0]);
              }
              if (
                event.key === "Escape" &&
                resultsOpen &&
                query.trim().length >= 2
              ) {
                event.stopPropagation();
                setResultsOpen(false);
              }
            }}
          />
          {query && (
            <button
              className="clear-btn"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setHits([]);
                setResultsOpen(false);
              }}
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="coord-pill landing-coords mono"
            aria-label="Copy coordinates"
            title={placeLabel || "Copy coordinates"}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(
                  `${formatCoord(center.lat)}, ${formatCoord(center.lon)}`,
                )
                .catch(() => undefined);
            }}
          >
            <span>
              {formatCoord(center.lat)}, {formatCoord(center.lon)}
            </span>
            <Copy size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {resultsOpen && query.trim().length >= 2 && (
          <div className="results landing-results" id="place-results" role="listbox">
            {searching && <p className="result-note">Searching…</p>}
            {searchError && <p className="result-note">{searchError}</p>}
            {!searching && !searchError && hits.length === 0 && (
              <p className="result-note">No matches.</p>
            )}
            {hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                onClick={() => choose(hit)}
              >
                <strong>{hit.label}</strong>
                <span>{hit.detail}</span>
              </button>
            ))}
          </div>
        )}
        {recent.length > 0 ? (
          <div className="quick-chips search-history landing-recent-row" aria-label="Recent searches" role="group">
            <span className="chips-label recent-label">Recent</span>
            {recent.map((hit, idx) => (
              <button
                key={hit.id}
                type="button"
                className={idx === 0 ? "q-chip active search-history-item recent-chip" : "q-chip search-history-item recent-chip"}
                aria-label={`${hit.label}, ${hit.detail}`}
                onClick={() => {
                  setRecent(addSearchHistory(storageOrNull(), hit));
                  setResultsOpen(false);
                  onPlace(hit);
                }}
              >
                <span className="search-history-text">
                  <span>{hit.label}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              className="q-clear search-history-clear recent-clear"
              onClick={() => {
                clearSearchHistory(storageOrNull());
                setRecent([]);
                setDismissedPresets(true);
              }}
            >
              Clear
            </button>
          </div>
        ) : !dismissedPresets ? (
          <div className="quick-chips landing-recent-row" aria-label="Suggested places">
            <span className="chips-label recent-label">Recent</span>
            {DEFAULT_QUICK_PLACES.map((hit, idx) => {
              const isCurrent =
                placeLabel.toLowerCase().includes(hit.label.toLowerCase()) ||
                (idx === 0 && !placeLabel);
              return (
                <button
                  key={hit.id}
                  type="button"
                  className={isCurrent ? "q-chip active recent-chip" : "q-chip recent-chip"}
                  onClick={() => {
                    setRecent(addSearchHistory(storageOrNull(), hit));
                    setResultsOpen(false);
                    onPlace(hit);
                  }}
                >
                  {hit.label}
                </button>
              );
            })}
            <button
              type="button"
              className="q-clear recent-clear"
              onClick={() => setDismissedPresets(true)}
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {/* 3. Top-Right Basemap Segmented Switcher */}
      <div className="top-right-hud landing-basemap-pill hud-surface" role="group" aria-label="Basemap">
        <button
          type="button"
          className={basemap === "map" ? "bm-btn active shape-btn on" : "bm-btn shape-btn"}
          aria-pressed={basemap === "map"}
          onClick={() => onBasemap("map")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          Map
        </button>
        <button
          type="button"
          className={basemap === "satellite" ? "bm-btn active shape-btn on" : "bm-btn shape-btn"}
          aria-pressed={basemap === "satellite"}
          onClick={() => onBasemap("satellite")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          Satellite
        </button>
      </div>

      {/* 4. Bottom-Center Studio Workbench Dock */}
      <div className="bottom-workbench landing-workbench-dock hud-surface">
        {/* Group 1: Cut Size */}
        <div className="wb-group dock-section">
          <div className="wb-head">
            <label className="wb-label dock-group-label" htmlFor={sliderId}>
              Cut Size
            </label>
            <span className="wb-val dock-readout mono">
              {sideM.toLocaleString()} m · {area.toFixed(2)} km²
            </span>
          </div>
          <div className="wb-controls">
            <div className="seg-track shape-toggle dock-seg mono" role="group" aria-label="Cut size presets">
              {SIDE_PRESETS_KM.map((km) => {
                const active = Math.abs(sideKm - km) < 0.001;
                return (
                  <button
                    key={km}
                    type="button"
                    className={active ? "seg-item on-yellow shape-btn on" : "seg-item shape-btn"}
                    onClick={() => onSideKm(km)}
                  >
                    {formatPresetKm(km)}
                  </button>
                );
              })}
            </div>
            <div className="mini-scrubber" title="Fine-tune cut size (200m – 2,000m)">
              <div className="scrubber-line" aria-hidden="true">
                <div className="scrubber-fill" style={{ width: `${sliderPct}%` }} />
                <div className="scrubber-knob" style={{ left: `${sliderPct}%` }} />
              </div>
              <input
                id={sliderId}
                className="dock-slider scrubber-input"
                type="range"
                min={MIN_SIDE_KM}
                max={MAX_SIDE_KM}
                step={0.05}
                value={sideKm}
                aria-label="Area size"
                aria-valuemin={MIN_SIDE_KM}
                aria-valuemax={MAX_SIDE_KM}
                aria-valuenow={sideKm}
                aria-valuetext={`${formatKmSide(sideKm)} kilometres per side`}
                onChange={(event) => onSideKm(Number(event.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="wb-divider dock-sep" aria-hidden="true" />

        {/* Group 2: Shape */}
        <div className="wb-group dock-section">
          <div className="wb-head">
            <span className="wb-label dock-group-label">Shape</span>
          </div>
          <div className="wb-controls">
            <div className="seg-track shape-toggle dock-seg" role="group" aria-label="Site area shape">
              <button
                type="button"
                className={frameShape === "square" ? "seg-item on-white shape-btn on" : "seg-item shape-btn"}
                aria-pressed={frameShape === "square"}
                aria-label="Square"
                onClick={() => onFrameShape("square")}
              >
                □ Square
              </button>
              <button
                type="button"
                className={frameShape === "circle" ? "seg-item on-white shape-btn on" : "seg-item shape-btn"}
                aria-pressed={frameShape === "circle"}
                aria-label="Circle"
                onClick={() => onFrameShape("circle")}
              >
                ○ Circle
              </button>
            </div>
          </div>
        </div>

        <div className="wb-divider dock-sep" aria-hidden="true" />

        {/* Group 3: Included Layers (3x2 grid) */}
        <div className="wb-group dock-section">
          <div className="wb-head">
            <span className="wb-label dock-group-label">Included Layers</span>
            <span className="wb-val mono">
              {activeLayerCount} / {LAYER_ITEMS.length} active
            </span>
          </div>
          <div className="layer-chips-grid dock-layers" role="group" aria-label="Layers">
            {LAYER_ITEMS.map((item) => {
              const isOn = layers[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  className={isOn ? "l-chip dock-layer-chip is-on" : "l-chip dock-layer-chip is-off"}
                  aria-pressed={isOn}
                  aria-label={item.label}
                  onClick={() => onLayer(item.key, !isOn)}
                >
                  <span className="l-chip-check dock-chip-dot" aria-hidden="true">
                    {isOn ? "✓" : ""}
                  </span>
                  <span>{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="wb-divider dock-sep" aria-hidden="true" />

        {/* Group 4: Primary Action */}
        <div className="sidebar-foot dock-cta-wrap">
          {error && (
            <p className="error sidebar-foot-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="wb-cta sidebar-primary create-fab"
            disabled={loading}
            onClick={onCreate}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            <span>{loading ? "Reading the map…" : "Create model"}</span>
            <span className="create-fab-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
