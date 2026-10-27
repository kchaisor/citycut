import { useEffect, useId, useRef, useState } from "react";
import { Copy, History, Search, X } from "lucide-react";
import { MAX_SIDE_KM, MIN_SIDE_KM } from "../content/constants";
import { CRS_NOTE, mgaCrs } from "../lib/crs";
import { formatCoord, formatKmSide } from "../lib/geo";
import { cutFrameLabelKm } from "../lib/placeLabel";
import { searchPlaces } from "../lib/nominatim";
import { addSearchHistory, clearSearchHistory, readSearchHistory } from "../lib/searchHistory";
import type { PlaceHit, SiteFrameShape, UiLayers } from "../types";
import { Mark } from "./Mark";

const SIDE_PRESETS_KM = [0.25, 0.5, 1, 2] as const;

function formatPresetKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
}

const LAYER_ITEMS: {
  key: keyof UiLayers;
  label: string;
  shortLabel: string;
}[] = [
  { key: "buildings", label: "Buildings", shortLabel: "Buildings" },
  { key: "roads", label: "Roads and rail", shortLabel: "Roads" },
  { key: "waterGreen", label: "Water and green", shortLabel: "Water & green" },
  { key: "trees", label: "Trees", shortLabel: "Trees" },
  { key: "terrain", label: "Terrain", shortLabel: "Terrain" },
  { key: "contours", label: "Contours", shortLabel: "Contours" },
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
  const boxRef = useRef<HTMLDivElement>(null);

  const area =
    frameShape === "circle" ? Math.PI * (sideKm / 2) ** 2 : sideKm * sideKm;
  const sizeLabel = cutFrameLabelKm(sideKm, frameShape);
  const crs = mgaCrs(center.lon);

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
      <div className="sidebar-brand-bar landing-brand-pill">
        <button className="sidebar-brand" type="button" onClick={onHome} aria-label="CityCut home">
          <span className="sidebar-brand-mark">
            <Mark />
          </span>
          <span className="sidebar-brand-name">CityCut</span>
        </button>
        <span className="studio-v-sep" aria-hidden="true" />
        <span className="landing-crs-badge" title={CRS_NOTE}>
          <span className="landing-crs-dot" aria-hidden="true" />
          GDA2020 · MGA{crs.zone}
        </span>
        <span className="landing-coords" title={placeLabel}>
          <span>
            {formatCoord(center.lat)}, {formatCoord(center.lon)}
          </span>
          <button
            type="button"
            className="sidebar-icon-btn"
            aria-label="Copy coordinates"
            title="Copy coordinates"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(
                  `${formatCoord(center.lat)}, ${formatCoord(center.lon)}`,
                )
                .catch(() => undefined);
            }}
          >
            <Copy size={12} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </span>
      </div>

      {/* 2. Top-Center Floating Omnibox + Recent Searches */}
      <div className="landing-omnibox-wrap" ref={boxRef}>
        <div className="search landing-omnibox">
          <Search className="search-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
          <label className="sr-only" htmlFor={searchId}>
            Search a place
          </label>
          <input
            id={searchId}
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
        {recent.length > 0 && (
          <div className="search-history landing-recent-row" aria-label="Recent searches" role="group">
            <span className="recent-label">Recent</span>
            <ul className="recent-chips">
              {recent.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    className="search-history-item recent-chip"
                    aria-label={`${hit.label}, ${hit.detail}`}
                    onClick={() => {
                      setRecent(addSearchHistory(storageOrNull(), hit));
                      setResultsOpen(false);
                      onPlace(hit);
                    }}
                  >
                    <History size={12} strokeWidth={1.75} aria-hidden="true" />
                    <span className="search-history-text">
                      <span>{hit.label}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="search-history-clear recent-clear"
              onClick={() => {
                clearSearchHistory(storageOrNull());
                setRecent([]);
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* 3. Top-Right Basemap Segmented Toggle */}
      <div className="landing-basemap-pill">
        <div className="shape-toggle landing-basemap-seg" role="group" aria-label="Basemap">
          {(["map", "satellite"] as const).map((b) => (
            <button
              key={b}
              type="button"
              className={basemap === b ? "shape-btn on" : "shape-btn"}
              aria-pressed={basemap === b}
              onClick={() => onBasemap(b)}
            >
              {b === "map" ? "Map" : "Satellite"}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Bottom-Center Studio Workbench Dock */}
      <div className="landing-workbench-dock">
        <div className="dock-section">
          <span className="dock-group-label">Shape</span>
          <div className="shape-toggle dock-seg" role="group" aria-label="Site area shape">
            <button
              type="button"
              className={frameShape === "square" ? "shape-btn on" : "shape-btn"}
              aria-pressed={frameShape === "square"}
              onClick={() => onFrameShape("square")}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />
              </svg>
              Square
            </button>
            <button
              type="button"
              className={frameShape === "circle" ? "shape-btn on" : "shape-btn"}
              aria-pressed={frameShape === "circle"}
              onClick={() => onFrameShape("circle")}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" />
              </svg>
              Circle
            </button>
          </div>
        </div>

        <span className="dock-sep" aria-hidden="true" />

        <div className="dock-section">
          <label className="dock-group-label" htmlFor={sliderId}>
            Cut size
          </label>
          <div className="shape-toggle dock-seg" role="group" aria-label="Cut size presets">
            {SIDE_PRESETS_KM.map((km) => (
              <button
                key={km}
                type="button"
                className={Math.abs(sideKm - km) < 0.001 ? "shape-btn on" : "shape-btn"}
                onClick={() => onSideKm(km)}
              >
                {formatPresetKm(km)}
              </button>
            ))}
          </div>
          <input
            id={sliderId}
            className="dock-slider"
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
          <span className="dock-readout">
            {sizeLabel} · {area.toFixed(2)} km²
          </span>
        </div>

        <span className="dock-sep" aria-hidden="true" />

        <div className="dock-section">
          <span className="dock-group-label">Layers</span>
          <div className="dock-layers" role="group" aria-label="Layers">
            {LAYER_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={layers[item.key] ? "dock-layer-chip is-on" : "dock-layer-chip"}
                aria-pressed={layers[item.key]}
                aria-label={item.label}
                onClick={() => onLayer(item.key, !layers[item.key])}
              >
                <span className="dock-chip-dot" aria-hidden="true" />
                <span>{item.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <span className="dock-sep" aria-hidden="true" />

        <div className="sidebar-foot dock-cta-wrap">
          {error && (
            <p className="error sidebar-foot-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="sidebar-primary create-fab"
            disabled={loading}
            onClick={onCreate}
          >
            <span className="create-fab-dot" aria-hidden="true" />
            <span>{loading ? "Reading the map…" : "Create model"}</span>
            <span className="create-fab-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
