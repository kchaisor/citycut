import { useEffect, useId, useRef, useState } from "react";
import { Box, Layers, Scaling, Search } from "lucide-react";
import { MAX_SIDE_KM, MIN_SIDE_KM } from "../content/constants";
import { formatKmSide } from "../lib/geo";
import { searchPlaces } from "../lib/nominatim";
import { reduceRail } from "../lib/railState";
import type { PlaceHit, UiLayers } from "../types";
import { Drawer } from "./Drawer";
import { IconRail, type RailItem } from "./IconRail";

const DRAWER_ID = "select-drawer";

const ROWS: { key: keyof UiLayers; label: string; soon?: boolean; hint?: string }[] = [
  { key: "buildings", label: "Buildings" },
  { key: "roads", label: "Roads and rail" },
  { key: "terrain", label: "Terrain" },
  { key: "contours", label: "Contours", hint: "Site plan" },
  { key: "waterGreen", label: "Water and green" },
  { key: "trees", label: "Trees" },
  { key: "satellite", label: "Satellite image", hint: "Basemap only" },
];

const TITLES: Record<string, string> = {
  search: "Search",
  area: "Area size",
  layers: "Include in the model",
  create: "Create model",
};

const iconProps = { size: 18, strokeWidth: 1.75, "aria-hidden": true as const };

const RAIL: RailItem[] = [
  { id: "search", label: "Search", icon: <Search {...iconProps} /> },
  { id: "area", label: "Area size", icon: <Scaling {...iconProps} /> },
  { id: "layers", label: "Layers", icon: <Layers {...iconProps} /> },
  { id: "create", label: "Create model", icon: <Box {...iconProps} /> },
];

export function SelectChrome({
  placeLabel,
  sideKm,
  layers,
  loading,
  error,
  onSideKm,
  onLayer,
  onPlace,
  onCreate,
}: {
  placeLabel: string;
  sideKm: number;
  layers: UiLayers;
  loading: boolean;
  error: string | null;
  onSideKm: (km: number) => void;
  onLayer: (key: keyof UiLayers, on: boolean) => void;
  onPlace: (place: PlaceHit) => void;
  onCreate: () => void;
}) {
  const sliderId = useId();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const area = sideKm * sideKm;

  useEffect(() => {
    if (error) setOpen("create");
  }, [error]);

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
        setSearchError(err instanceof Error ? "Search is unavailable right now." : "Search failed.");
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
      if (!boxRef.current?.contains(event.target as Node)) setResultsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle(id: string) {
    setOpen((current) => reduceRail(current, { type: "toggle", id }));
  }

  function close() {
    setOpen((current) => reduceRail(current, { type: "close" }));
  }

  function choose(hit: PlaceHit) {
    onPlace(hit);
    setQuery(hit.label);
    setResultsOpen(false);
  }

  return (
    <div className="chrome select-chrome">
      <IconRail items={RAIL} openId={open} onToggle={toggle} label="Map tools" drawerId={DRAWER_ID} />
      <Drawer id={DRAWER_ID} open={open !== null} title={TITLES[open ?? "search"] ?? "Search"} onClose={close}>
        <div className="drawer-section" hidden={open !== "search"}>
          <p className="place-label">{placeLabel}</p>
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
                if (event.key === "Escape" && resultsOpen && query.trim().length >= 2) {
                  event.stopPropagation();
                  setResultsOpen(false);
                }
              }}
            />
            {resultsOpen && query.trim().length >= 2 && (
              <div className="results" id="place-results" role="listbox">
                {searching && <p className="result-note">Searching…</p>}
                {searchError && <p className="result-note">{searchError}</p>}
                {!searching && !searchError && hits.length === 0 && <p className="result-note">No matches.</p>}
                {hits.map((hit) => (
                  <button key={hit.id} type="button" role="option" onClick={() => choose(hit)}>
                    <strong>{hit.label}</strong>
                    <span>{hit.detail}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="drawer-section" hidden={open !== "area"}>
          <div className="field">
            <div className="field-head">
              <label htmlFor={sliderId}>Area size</label>
              <strong>
                {formatKmSide(sideKm)} × {formatKmSide(sideKm)} km
              </strong>
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
            <p className="field-note">{area.toFixed(2)} km² · square frame, max about 2 km²</p>
          </div>
        </div>

        <div className="drawer-section" hidden={open !== "layers"}>
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
              ? "Elevation from Mapterhorn. Contours, when on, are added to the site plan."
              : "Terrain is off, so the ground stays a flat surface. Contours need Terrain."}
          </p>
          <p className="attrib">
            © OpenStreetMap contributors
            {layers.terrain && (
              <>
                {" · "}
                <a href="https://mapterhorn.com/attribution">Terrain © Mapterhorn</a>
              </>
            )}
          </p>
        </div>

        <div className="drawer-section" hidden={open !== "create"}>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" type="button" data-autofocus="true" disabled={loading} onClick={onCreate}>
            {loading ? "Reading the map…" : "Create model"}
          </button>
          <p className="hint">Pan and zoom until the block you want sits inside the frame.</p>
        </div>
      </Drawer>
      <button className="primary create-fab" type="button" disabled={loading} onClick={onCreate}>
        {loading ? "Reading the map…" : "Create model"}
      </button>
    </div>
  );
}
