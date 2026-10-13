import { useEffect, useId, useRef, useState } from "react";
import { Box, Copy, Frame, Layers, Search } from "lucide-react";
import { MAX_SIDE_KM, MIN_SIDE_KM } from "../content/constants";
import { formatCoord, formatKmSide } from "../lib/geo";
import { useSidebarCollapsed } from "../lib/sidebarCollapse";
import { cutFrameLabelKm } from "../lib/placeLabel";
import { searchPlaces } from "../lib/nominatim";
import { DATA_CREDIT_BASE } from "../lib/dataCredits";
import type { PlaceHit, SiteFrameShape, UiLayers } from "../types";
import { Sidebar, type SidebarItem } from "./Sidebar";

const DRAWER_ID = "select-drawer";

const ROWS: {
  key: keyof UiLayers;
  label: string;
  soon?: boolean;
  hint?: string;
}[] = [
  { key: "buildings", label: "Buildings" },
  { key: "roads", label: "Roads and rail" },
  { key: "terrain", label: "Terrain" },
  { key: "contours", label: "Contours", hint: "Site plan" },
  { key: "waterGreen", label: "Water and green" },
  { key: "trees", label: "Trees" },
  { key: "satellite", label: "Satellite image", hint: "Basemap only" },
];

const TITLES: Record<string, string> = {
  search: "Place",
  cut: "Cut",
  layers: "Layers",
};

const iconProps = { size: 18, strokeWidth: 1.75, "aria-hidden": true as const };

const RAIL: SidebarItem[] = [
  { id: "search", label: "Place", icon: <Search {...iconProps} /> },
  { id: "cut", label: "Cut", icon: <Frame {...iconProps} /> },
  { id: "layers", label: "Layers", icon: <Layers {...iconProps} /> },
];

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
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [open, setOpen] = useState<string>("search");
  const boxRef = useRef<HTMLDivElement>(null);
  const area =
    frameShape === "circle" ? Math.PI * (sideKm / 2) ** 2 : sideKm * sideKm;
  const sizeLabel = cutFrameLabelKm(sideKm, frameShape);

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
    onPlace(hit);
    setQuery(hit.label);
    setResultsOpen(false);
  }

  return (
    <div className="select-chrome">
      <Sidebar
        id={DRAWER_ID}
        items={RAIL}
        active={open}
        collapsed={collapsed}
        title={TITLES[open]}
        onHome={onHome}
        onSelect={(id) => {
          setOpen(id);
          setCollapsed(false);
        }}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        status={
          <span className="sidebar-status">
            {sizeLabel} {frameShape}
          </span>
        }
        // `create-fab` stays as a hook for the QA scripts in scripts/ (no styles).
        footer={
          <>
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
              <Box size={16} strokeWidth={1.75} aria-hidden="true" />
              {loading ? "Reading the map…" : "Create model"}
            </button>
          </>
        }
      >
        <div className="drawer-section" hidden={open !== "search"}>
          <div className="sidebar-hero">
            <p className="sidebar-place">{placeLabel}</p>
            <p className="sidebar-sub">
              {sizeLabel} {frameShape} · {area.toFixed(2)} km²
            </p>
            <p className="sidebar-coord">
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
                <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </p>
          </div>
          <div className="search" ref={boxRef}>
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
            {resultsOpen && query.trim().length >= 2 && (
              <div className="results" id="place-results" role="listbox">
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
          </div>
        </div>

        <div className="drawer-section" hidden={open !== "cut"}>
          <div className="field">
            <div className="field-head">
              <label htmlFor={sliderId}>Area size</label>
              <strong>{sizeLabel}</strong>
            </div>
            <input
              id={sliderId}
              type="range"
              min={MIN_SIDE_KM}
              max={MAX_SIDE_KM}
              step={0.05}
              value={sideKm}
              data-autofocus="true"
              aria-valuemin={MIN_SIDE_KM}
              aria-valuemax={MAX_SIDE_KM}
              aria-valuenow={sideKm}
              aria-valuetext={`${formatKmSide(sideKm)} kilometres per side`}
              onChange={(event) => onSideKm(Number(event.target.value))}
            />
            <p className="field-note">
              {area.toFixed(2)} km² · {frameShape} frame, up to 2 km{" "}
              {frameShape === "circle" ? "ø" : "side"} (4 km² square max)
            </p>
          </div>
          <div className="field">
            <div className="field-head">
              <span>Area shape</span>
            </div>
            <div
              className="shape-toggle"
              role="group"
              aria-label="Site area shape"
            >
              <button
                type="button"
                className={
                  frameShape === "square" ? "shape-btn on" : "shape-btn"
                }
                aria-pressed={frameShape === "square"}
                onClick={() => onFrameShape("square")}
              >
                Square
              </button>
              <button
                type="button"
                className={
                  frameShape === "circle" ? "shape-btn on" : "shape-btn"
                }
                aria-pressed={frameShape === "circle"}
                onClick={() => onFrameShape("circle")}
              >
                Circle
              </button>
            </div>
          </div>
        </div>
        <div className="drawer-section" hidden={open !== "layers"}>
          <div className="field">
            <div className="field-head">
              <span>Basemap</span>
            </div>
            <div className="shape-toggle" role="group" aria-label="Basemap">
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
          <ul className="layers">
            {ROWS.map((row, index) => (
              <li key={row.key}>
                <span className="layer-name">
                  {row.label}
                  {row.soon && <span className="soon">Soon</span>}
                  {row.hint && <span className="layer-hint">{row.hint}</span>}
                </span>
                <button
                  type="button"
                  className={layers[row.key] ? "toggle on" : "toggle"}
                  aria-pressed={layers[row.key]}
                  aria-label={row.label}
                  data-autofocus={index === 0 ? "true" : undefined}
                  onClick={() => onLayer(row.key, !layers[row.key])}
                >
                  <i />
                </button>
              </li>
            ))}
          </ul>
          <p className="field-note">
            {layers.terrain
              ? "Elevation from Mapterhorn. Contours inside Victoria come from Vicmap Elevation, and from this terrain if that service fails."
              : "Terrain is off, so the ground stays a flat surface. Contours inside Victoria still use Vicmap Elevation."}
          </p>
          <p className="attrib">{DATA_CREDIT_BASE}</p>
        </div>
      </Sidebar>
    </div>
  );
}
