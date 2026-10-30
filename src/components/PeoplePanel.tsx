import { useEffect, useMemo, useRef, useState } from "react";
import {
  AGE_BANDS,
  CENSUS_ATTRIBUTION,
  hundredPeople,
  loadCensusForSite,
  share,
  type CensusSiteResult,
  type CensusValues,
  type SelectedSa1,
} from "../lib/censusPeople";
import type { CensusSa1Layer } from "../lib/censusSa1Layer";
import { toLocal } from "../lib/geo";
import type { PeopleCityLayer } from "../lib/peopleCityLayer";
import { prismHeights, prismMaxHeightM, prismMetricValue, prismSteps } from "../lib/peopleMetrics";
import { usePeople, type PeopleState, type PeopleStore, type PeopleView } from "../lib/peopleStore";
import type { SiteFrameShape } from "../lib/siteFrame";
import type { LonLat } from "../types";
import { CityView, DeckView, LensView } from "./PeopleViews";

const MELBOURNE_GPO = { lat: -37.8136, lon: 144.9631 };

const VIEWS: { id: PeopleView; label: string }[] = [
  { id: "lens", label: "Lens" },
  { id: "city", label: "Living City" },
  { id: "deck", label: "Neighbours" },
  { id: "profile", label: "Profile" },
];

const selectView = (s: PeopleState) => s.view;

function useLayerSync(store: PeopleStore, layer: PeopleCityLayer | undefined, center: LonLat, sideM: number): void {
  useEffect(() => {
    if (!layer) return;
    let prev: PeopleState | null = null;
    const apply = () => {
      const s = store.get();
      const now = performance.now();
      const p = prev;
      prev = s;
      const sa1 = s.census?.status === "ok" ? s.census.sa1 : [];
      if (!p || p.census !== s.census) {
        layer.setSa1(sa1, s.index);
        layer.setDestinations(toLocal(MELBOURNE_GPO.lat, MELBOURNE_GPO.lon, center), null);
      }
      if (!p || p.census !== s.census || p.city.metric !== s.city.metric || p.city.band !== s.city.band) {
        const max = prismMaxHeightM(sideM);
        const heights = prismHeights(
          sa1.map((x) => prismMetricValue(x, s.city.metric, s.city.band)),
          s.city.metric,
          max,
        );
        layer.setHeights(heights, prismSteps(heights, max), now, Boolean(p && p.census === s.census));
      }
      layer.setPrismsVisible(s.active && s.city.prisms);
      layer.setDots(s.active && s.city.dots, s.city.modes);
      layer.setPlaying(s.active && s.city.dots && s.city.playing, now);
      const lensOn = s.active && s.view === "lens" && s.lens !== null;
      layer.setLens(lensOn ? s.centre : null, s.radius);
      if (!p || p.pins !== s.pins) layer.setPins(s.pins);
      layer.setPinsVisible(lensOn);
      if (!p || p.highlight !== s.highlight) layer.setHighlight(s.highlight?.codes ?? null);
      layer.setSelected(s.active && s.city.prisms ? s.selected : null);
    };
    apply();
    return store.subscribe(apply);
  }, [store, layer, center, sideM]);
}

const RAMP = ["var(--people-1)", "var(--people-2)", "var(--people-3)", "var(--people-4)", "var(--people-5)"];
const AGE_COLOURS = [
  "var(--people-1)",
  "var(--people-2)",
  "var(--people-3)",
  "var(--people-4)",
  "var(--people-5)",
  "var(--people-4)",
  "var(--people-2)",
];

const SHARE_COLOURS = ["var(--people-5)", "var(--people-3)", "var(--people-2)", "var(--people-4)", "var(--people-1)"];

type MapMetric = "density" | "medAge" | "renters" | "noCar";

const MAP_METRICS: { id: MapMetric; label: string }[] = [
  { id: "density", label: "Density" },
  { id: "medAge", label: "Age" },
  { id: "renters", label: "Renters" },
  { id: "noCar", label: "No car" },
];

function renterShare(v: CensusValues): number {
  return share(v.tenRent, [v.tenOwned, v.tenMortgage, v.tenRent, v.tenOther]);
}

function noCarShare(v: CensusValues): number {
  return share(v.car0, [v.car0, v.car1, v.car2, v.car3p]);
}

function metricValue(sa1: SelectedSa1, metric: MapMetric): number {
  if (metric === "density") {
    const full = sa1.fraction > 0 ? sa1.clippedKm2 / sa1.fraction : 0;
    return full > 0 ? sa1.values.pop / full : 0;
  }
  if (metric === "medAge") return sa1.values.medAge;
  if (metric === "renters") return renterShare(sa1.values);
  return noCarShare(sa1.values);
}

function formatMetric(value: number, metric: MapMetric): string {
  if (metric === "density") return `${fmtInt(value)}/km²`;
  if (metric === "medAge") return `${Math.round(value)} yrs`;
  return pct(value);
}

function quantileBreaks(values: number[]): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0, 0];
  return [0.2, 0.4, 0.6, 0.8].map((q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
}

function rampIndex(value: number, breaks: number[]): number {
  let index = 0;
  while (index < breaks.length && value > breaks[index]) index += 1;
  return index;
}

function rampSteps(sa1: readonly SelectedSa1[], metric: MapMetric): number[] {
  const values = sa1.map((s) => metricValue(s, metric));
  const breaks = quantileBreaks(values);
  return values.map((value) => rampIndex(value, breaks));
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-AU");
}

function fmtK(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : fmtInt(n);
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function ShareBar({
  label,
  parts,
  testId,
}: {
  label: string;
  parts: { label: string; value: number }[];
  testId: string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div className="people-block" data-testid={testId}>
      <div className="people-sub">{label}</div>
      <div className="people-stack" role="img" aria-label={label}>
        {parts.map((part, index) => (
          <span
            key={part.label}
            className="people-stack-seg"
            style={{ flexGrow: total > 0 ? part.value / total : 0, background: SHARE_COLOURS[index % SHARE_COLOURS.length] }}
          />
        ))}
      </div>
      <ul className="people-legend">
        {parts.map((part, index) => (
          <li key={part.label}>
            <span className="people-swatch" style={{ background: SHARE_COLOURS[index % SHARE_COLOURS.length] }} />
            {part.label} <b>{total > 0 ? pct(part.value / total) : "–"}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Sa1Map({
  sa1,
  sideM,
  shape,
  metric,
  hovered,
  onHover,
}: {
  sa1: SelectedSa1[];
  sideM: number;
  shape: SiteFrameShape;
  metric: MapMetric;
  hovered: string | null;
  onHover: (code: string | null) => void;
}) {
  const half = sideM / 2;
  const pad = sideM * 0.08;
  const steps = rampSteps(sa1, metric);
  const size = sideM + pad * 2;
  return (
    <svg
      className="people-map"
      viewBox={`${-half - pad} ${-half - pad} ${size} ${size}`}
      role="img"
      aria-label="SA1 areas in the cut"
      data-testid="people-sa1-map"
    >
      <defs>
        <clipPath id="people-map-clip">
          <rect x={-half - pad} y={-half - pad} width={size} height={size} />
        </clipPath>
      </defs>
      <g clipPath="url(#people-map-clip)" transform="scale(1,-1)">
        {sa1.map((s, i) => (
          <path
            key={s.code}
            data-sa1={s.code}
            className={hovered === s.code ? "people-map-sa1 is-hovered" : "people-map-sa1"}
            d={s.rings.map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`).join("")}
            fillRule="evenodd"
            style={{ fill: RAMP[steps[i]] }}
            onMouseEnter={() => onHover(s.code)}
            onMouseLeave={() => onHover(null)}
          />
        ))}
        {shape === "circle" ? (
          <circle className="people-map-frame" cx={0} cy={0} r={half} />
        ) : (
          <rect className="people-map-frame" x={-half} y={-half} width={sideM} height={sideM} />
        )}
      </g>
    </svg>
  );
}

export function PeoplePanel({
  active,
  center,
  sideM,
  shape,
  overlay,
  overlayShown,
  store,
  layer,
}: {
  active: boolean;
  center: LonLat;
  sideM: number;
  shape: SiteFrameShape;
  overlay?: CensusSa1Layer;
  overlayShown?: boolean;
  store: PeopleStore;
  layer?: PeopleCityLayer;
}) {
  const view = usePeople(store, selectView);
  useLayerSync(store, layer, center, sideM);
  const siteKey = `${center.lat},${center.lon},${sideM},${shape}`;
  const [loaded, setLoaded] = useState<{ key: string; result: CensusSiteResult } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [band, setBand] = useState<number | null>(null);
  const [metric, setMetric] = useState<MapMetric>("density");
  const [overlayOn, setOverlayOn] = useState(false);
  const startedKey = useRef<string | null>(null);
  const result = loaded?.key === siteKey ? loaded.result : null;

  useEffect(() => {
    if (!overlay) return;
    if (result?.status !== "ok") {
      overlay.setAreas([]);
      return;
    }
    const steps = rampSteps(result.sa1, metric);
    overlay.setAreas(result.sa1.map((s, i) => ({ code: s.code, rings: s.rings, step: steps[i] })));
  }, [overlay, result, metric]);

  useEffect(() => {
    overlay?.setVisible(overlayOn);
  }, [overlay, overlayOn]);

  useEffect(() => {
    overlay?.setHovered(hovered);
  }, [overlay, hovered]);

  useEffect(() => {
    store.setActive(active);
  }, [store, active]);

  useEffect(() => {
    store.setCensus(result);
  }, [store, result]);

  useEffect(() => {
    if (!active || startedKey.current === siteKey) return;
    startedKey.current = siteKey;
    const key = siteKey;
    loadCensusForSite({ lat: center.lat, lon: center.lon }, sideM, shape).then((next) => {
      if (startedKey.current === key) setLoaded({ key, result: next });
    });
  }, [active, siteKey, center.lat, center.lon, sideM, shape]);

  const hoveredSa1 = useMemo(
    () => (result?.status === "ok" && hovered ? result.sa1.find((s) => s.code === hovered) ?? null : null),
    [result, hovered],
  );

  if (!result) {
    return (
      <div className="people-panel" data-testid="people-panel" data-state="loading">
        <p className="people-note">Loading ABS Census 2021 SA1 data…</p>
      </div>
    );
  }

  if (result.status !== "ok") {
    return (
      <div className="people-panel" data-testid="people-panel" data-state={result.status}>
        <div className="people-error" role="status" data-testid="people-error">
          <b>{result.status === "error" ? "Census data unavailable" : "Outside Census coverage"}</b>
          <p>{result.reason}</p>
          <p>No figures are shown.</p>
        </div>
        <p className="people-source">{CENSUS_ATTRIBUTION}</p>
      </div>
    );
  }

  const { site, greaterMelbourne: gm, parentSa2 } = result;
  const v = hoveredSa1 ? hoveredSa1.values : site.values;
  const ageCounts = AGE_BANDS.map((b) => v[b.key]);
  const gmAge = AGE_BANDS.map((b) => gm[b.key]);
  const dots = hundredPeople(ageCounts);
  const dotBands = dots.flatMap((count, index) => Array.from({ length: count }, () => index));
  const ageShares = ageCounts.map((n) => share(n, ageCounts));
  const gmShares = gmAge.map((n) => share(n, gmAge));
  const maxShare = Math.max(...ageShares, ...gmShares, 0.01);
  const est = site.estimated && !hoveredSa1 ? "est." : "";
  const scopeLabel = hoveredSa1 ? `SA1 ${hoveredSa1.code}` : `${result.sa1.length} SA1s in the cut`;
  const mapValues = result.sa1.map((s) => metricValue(s, metric));

  const viewTabs = (
    <div className="people-views" role="tablist" aria-label="People views">
      {VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={view === item.id}
          className={view === item.id ? "people-view-tab is-on" : "people-view-tab"}
          data-testid={`people-view-${item.id}`}
          onClick={() => store.setView(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  if (view !== "profile") {
    return (
      <div className="people-panel" data-testid="people-panel" data-state="ok" data-view={view}>
        {viewTabs}
        {view === "lens" ? <LensView store={store} census={result} sideM={sideM} shape={shape} model3d={Boolean(overlayShown)} /> : null}
        {view === "city" ? <CityView store={store} census={result} model3d={Boolean(overlayShown)} /> : null}
        {view === "deck" ? <DeckView store={store} census={result} /> : null}
        <p className="people-source" data-testid="people-source">
          {CENSUS_ATTRIBUTION}
        </p>
      </div>
    );
  }

  return (
    <div className="people-panel" data-testid="people-panel" data-state="ok" data-view="profile">
      {viewTabs}
      <div className="people-scope mono" data-testid="people-scope">
        <span>{scopeLabel}</span>
        <span>SA2 {parentSa2.name}</span>
      </div>
      <div className="people-kpis mono">
        <div className="people-kpi" data-testid="people-kpi-residents">
          <span className="people-kpi-lbl">Residents {est}</span>
          <b>{fmtInt(v.pop)}</b>
        </div>
        <div className="people-kpi" data-testid="people-kpi-density">
          <span className="people-kpi-lbl">Density {est}</span>
          <b>
            {fmtK(
              hoveredSa1
                ? metricValue(hoveredSa1, "density")
                : site.densityPerKm2,
            )}
            /km²
          </b>
        </div>
        <div className="people-kpi" data-testid="people-kpi-age">
          <span className="people-kpi-lbl">Med. age {est}</span>
          <b>{v.medAge > 0 ? Math.round(v.medAge) : "–"}</b>
        </div>
        <div className="people-kpi" data-testid="people-kpi-income">
          <span className="people-kpi-lbl">Hhd inc/wk {est}</span>
          <b>{v.medHhInc > 0 ? `$${fmtInt(v.medHhInc)}` : "–"}</b>
        </div>
        <div className="people-kpi">
          <span className="people-kpi-lbl">Renters</span>
          <b>{pct(renterShare(v))}</b>
        </div>
        <div className="people-kpi">
          <span className="people-kpi-lbl">No car</span>
          <b>{pct(noCarShare(v))}</b>
        </div>
      </div>

      <div className="people-block">
        <div className="people-sub people-sub-row">
          <span>SA1 map</span>
          <span className="people-chips">
            {MAP_METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={metric === m.id ? "people-chip is-on" : "people-chip"}
                aria-pressed={metric === m.id}
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </button>
            ))}
          </span>
        </div>
        <Sa1Map sa1={result.sa1} sideM={sideM} shape={shape} metric={metric} hovered={hovered} onHover={setHovered} />
        <div className="people-map-legend mono" aria-hidden="true">
          <span>{formatMetric(Math.min(...mapValues), metric)}</span>
          {RAMP.map((fill) => (
            <span key={fill} className="people-swatch" style={{ background: fill }} />
          ))}
          <span>{formatMetric(Math.max(...mapValues), metric)}</span>
        </div>
        <div className="people-map-tip mono" data-testid="people-map-tip">
          {hoveredSa1
            ? `SA1 ${hoveredSa1.code} · ${fmtInt(hoveredSa1.values.pop)} ppl · ${formatMetric(metricValue(hoveredSa1, metric), metric)}`
            : "Hover an SA1 to see its people"}
        </div>
        {overlay ? (
          <label className="people-overlay-toggle" data-testid="people-overlay-toggle">
            <input type="checkbox" checked={overlayOn} onChange={(event) => setOverlayOn(event.target.checked)} />
            <span>Show SA1s on the 3D model</span>
            {overlayOn && !overlayShown ? <em>3D view only</em> : null}
          </label>
        ) : null}
      </div>

      <div className="people-block" data-testid="people-hundred">
        <div className="people-sub">If {hoveredSa1 ? "this SA1" : "this cut"} were 100 people</div>
        <div className="people-dots" role="img" aria-label="100 people by age band">
          {dotBands.map((b, i) => (
            <span
              key={i}
              className={band === null || band === b ? "people-dot" : "people-dot is-dim"}
              style={{ background: AGE_COLOURS[b] }}
              onMouseEnter={() => setBand(b)}
              onMouseLeave={() => setBand(null)}
            />
          ))}
        </div>
      </div>

      <div className="people-block" data-testid="people-age">
        <div className="people-sub">Age · vs Greater Melbourne</div>
        {AGE_BANDS.map((b, i) => (
          <div
            key={b.key}
            className={band === i ? "people-age-row is-on" : "people-age-row"}
            onMouseEnter={() => setBand(i)}
            onMouseLeave={() => setBand(null)}
          >
            <span className="people-age-lbl mono">{b.label}</span>
            <span className="people-age-track">
              <span
                className="people-age-bar"
                style={{ width: `${(ageShares[i] / maxShare) * 100}%`, background: AGE_COLOURS[i] }}
              />
              <span className="people-age-tick" style={{ left: `${(gmShares[i] / maxShare) * 100}%` }} />
            </span>
            <span className="people-age-val mono">{dots[i]}</span>
          </div>
        ))}
        <div className="people-tick-key">
          <span className="people-age-tick is-key" /> Greater Melbourne ({gm.medAge} median age)
        </div>
      </div>

      <ShareBar
        label="Household type"
        testId="people-households"
        parts={[
          { label: "Family", value: v.hhFamily },
          { label: "Lone", value: v.hhLone },
          { label: "Group", value: v.hhGroup },
        ]}
      />
      <ShareBar
        label="Dwelling type"
        testId="people-dwellings"
        parts={[
          { label: "House", value: v.dwHouse },
          { label: "Semi/terrace", value: v.dwSemi },
          { label: "Apt 1–3 st", value: v.dwApt13 },
          { label: "Apt 4+ st", value: v.dwApt4p },
          { label: "Other", value: v.dwOther },
        ]}
      />
      <ShareBar
        label="Cars per dwelling"
        testId="people-cars"
        parts={[
          { label: "0", value: v.car0 },
          { label: "1", value: v.car1 },
          { label: "2", value: v.car2 },
          { label: "3+", value: v.car3p },
        ]}
      />
      <ShareBar
        label="Travel to work (Census day, Aug 2021 lockdown)"
        testId="people-travel"
        parts={[
          { label: "Car", value: v.twCar },
          { label: "Public transport", value: v.twPt },
          { label: "Walk/bike", value: v.twActive },
          { label: "Worked at home", value: v.twHome },
          { label: "Multi/other", value: v.twMulti + v.twOther },
        ]}
      />

      {parentSa2.values ? (
        <div className="people-block people-sa2 mono" data-testid="people-sa2">
          <div className="people-sub">Parent SA2 {parentSa2.code} (official)</div>
          <span>
            {parentSa2.name}: {fmtInt(parentSa2.values.pop)} people · median age {parentSa2.values.medAge} · median hhd
            inc ${fmtInt(parentSa2.values.medHhInc)}/wk
          </span>
        </div>
      ) : null}

      <p className="people-note">
        {site.estimated
          ? "Counts are estimates: SA1 counts apportioned by the share of each SA1's area inside the cut. Medians are population-weighted SA1 medians."
          : "Counts are whole SA1s inside the cut. Medians are population-weighted SA1 medians (estimate)."}
      </p>
      <p className="people-source" data-testid="people-source">
        {CENSUS_ATTRIBUTION}
      </p>
    </div>
  );
}
