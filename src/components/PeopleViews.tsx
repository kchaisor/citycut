import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AGE_BANDS, type CensusSiteResult, type SelectedSa1 } from "../lib/censusPeople";
import { LENS_RADII, lensShares, type LensMethod } from "../lib/peopleLens";
import {
  AGE_CARD_COLOURS,
  PEOPLE_PER_DOT,
  PRISM_METRICS,
  TRAVEL_MODES,
  buildDeck,
  buildQuiz,
  deckGrid,
  formatPrismValue,
  matchingSa1s,
  modeCounts,
  prismMetricValue,
  scoreGuess,
  workers,
  type PrismMetric,
} from "../lib/peopleMetrics";
import { usePeople, type PeopleState, type PeopleStore } from "../lib/peopleStore";
import type { SiteFrameShape } from "../lib/siteFrame";
import type { Pt } from "../types";

type OkCensus = Extract<CensusSiteResult, { status: "ok" }>;

const RAMP = ["var(--people-1)", "var(--people-2)", "var(--people-3)", "var(--people-4)", "var(--people-5)"];
const SWIPE_PX = 60;

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-AU");
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function ringPath(rings: readonly (readonly Pt[])[]): string {
  return rings.map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`).join("");
}

const selectLensState = (s: PeopleState) => s;

function Sparkline({ values }: { values: readonly number[] }) {
  const w = 220;
  const h = 34;
  if (values.length < 2) {
    return (
      <svg className="people-trail" viewBox={`0 0 ${w} ${h}`} data-testid="people-lens-trail" data-points={values.length} aria-hidden="true">
        <line x1={0} y1={h - 2} x2={w} y2={h - 2} className="people-trail-base" />
      </svg>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(",");
  return (
    <svg className="people-trail" viewBox={`0 0 ${w} ${h}`} data-testid="people-lens-trail" data-points={values.length} aria-hidden="true">
      <line x1={0} y1={h - 2} x2={w} y2={h - 2} className="people-trail-base" />
      <polyline points={pts.join(" ")} className="people-trail-line" />
      <circle cx={last[0]} cy={last[1]} r={3} className="people-trail-dot" />
    </svg>
  );
}

function LensPlan({
  store,
  sa1,
  sideM,
  shape,
  lit,
}: {
  store: PeopleStore;
  sa1: readonly SelectedSa1[];
  sideM: number;
  shape: SiteFrameShape;
  lit: ReadonlySet<string>;
}) {
  const state = usePeople(store, selectLensState);
  const svgRef = useRef<SVGSVGElement>(null);
  const grab = useRef<Pt | null>(null);
  const half = sideM / 2;
  const pad = sideM * 0.06;
  const size = sideM + pad * 2;
  const toLocal = useCallback((event: ReactPointerEvent): Pt | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return [p.x, -p.y];
  }, []);
  const onDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const p = toLocal(event);
    if (!p) return;
    const [cx, cy] = state.centre;
    const inside = Math.hypot(p[0] - cx, p[1] - cy) <= state.radius;
    grab.current = inside ? [p[0] - cx, p[1] - cy] : [0, 0];
    event.currentTarget.setPointerCapture(event.pointerId);
    store.setDragging(true);
    if (!inside) store.moveLens(p);
  };
  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!grab.current) return;
    const p = toLocal(event);
    if (p) store.moveLens([p[0] - grab.current[0], p[1] - grab.current[1]]);
  };
  const onUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!grab.current) return;
    grab.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    store.setDragging(false);
  };
  return (
    <svg
      ref={svgRef}
      className={state.dragging ? "people-lens-plan is-dragging" : "people-lens-plan"}
      viewBox={`${-half - pad} ${-half - pad} ${size} ${size}`}
      role="application"
      aria-label="People lens plan: drag the lens"
      data-testid="people-lens-plan"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <defs>
        <clipPath id="people-lens-clip">
          {shape === "circle" ? <circle cx={0} cy={0} r={half} /> : <rect x={-half} y={-half} width={sideM} height={sideM} />}
        </clipPath>
      </defs>
      <g transform="scale(1,-1)">
        <g clipPath="url(#people-lens-clip)">
          {sa1.map((s) => (
            <path
              key={s.code}
              d={ringPath(s.rings)}
              fillRule="evenodd"
              className={lit.has(s.code) ? "people-lens-sa1 is-lit" : "people-lens-sa1"}
              data-sa1={s.code}
            />
          ))}
        </g>
        {shape === "circle" ? (
          <circle className="people-map-frame" cx={0} cy={0} r={half} />
        ) : (
          <rect className="people-map-frame" x={-half} y={-half} width={sideM} height={sideM} />
        )}
        {state.pins.map((pin) => (
          <g key={pin.id}>
            <circle className="people-lens-pin" cx={pin.centre[0]} cy={pin.centre[1]} r={pin.radius} />
            <text
              className="people-lens-pin-label mono"
              x={pin.centre[0]}
              y={-pin.centre[1]}
              transform="scale(1,-1)"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: sideM * 0.035 }}
            >
              Pin {pin.label}
            </text>
          </g>
        ))}
        <circle className="people-lens-ring" cx={state.centre[0]} cy={state.centre[1]} r={state.radius} data-testid="people-lens-ring" />
        <circle className="people-lens-handle" cx={state.centre[0]} cy={state.centre[1]} r={sideM * 0.012} />
      </g>
    </svg>
  );
}

export function LensView({
  store,
  census,
  sideM,
  shape,
  model3d,
}: {
  store: PeopleStore;
  census: OkCensus;
  sideM: number;
  shape: SiteFrameShape;
  model3d: boolean;
}) {
  const state = usePeople(store, selectLensState);
  const lens = state.lens;
  const lit = useMemo(() => new Set(lens?.sa1Codes ?? []), [lens]);
  if (!lens) return null;
  const v = lens.values;
  const shares = lensShares(v);
  const live = lens.people;
  const methodLabel: Record<LensMethod, string> = { area: "Area-weighted", centroid: "By SA1 centroid" };
  return (
    <div className="people-view" data-testid="people-lens">
      <p className="people-lede">Drag the lens on this plan{model3d ? " or on the 3D model" : ""}. Everyone under it is summed live from SA1s.</p>
      <div className="people-sub people-sub-row">
        <span>Radius</span>
        <span className="people-chips" role="radiogroup" aria-label="Lens radius">
          {LENS_RADII.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={state.radius === r}
              className={state.radius === r ? "people-chip is-on" : "people-chip"}
              data-testid={`people-lens-r${r}`}
              onClick={() => store.setRadius(r)}
            >
              {r === 400 ? "400 m · 5′ walk" : `${r} m`}
            </button>
          ))}
        </span>
      </div>
      <LensPlan store={store} sa1={census.sa1} sideM={sideM} shape={shape} lit={lit} />
      <div className="people-lens-head">
        <div>
          <span className="people-kpi-lbl mono">
            Under the lens · {lens.sa1Codes.length} SA1s · r {state.radius} m
          </span>
          <div className="people-lens-count">
            <b data-testid="people-lens-count">{fmtInt(live)}</b>
            <span>people{lens.estimated ? " est." : ""}</span>
          </div>
        </div>
        <button type="button" className="people-btn" data-testid="people-lens-pin" disabled={state.pins.length >= 3} onClick={() => store.pin()}>
          Pin lens
        </button>
      </div>
      <div className="people-stack" role="img" aria-label="Age mix under the lens">
        {shares.age.map((s, i) => (
          <span key={AGE_BANDS[i].key} className="people-stack-seg" style={{ flexGrow: s, background: AGE_CARD_COLOURS[i] }} />
        ))}
      </div>
      <div className="people-age-ends mono">
        <span>0–14</span>
        <span>
          25–34 {pct(shares.age[2] ?? 0)}
        </span>
        <span>65+</span>
      </div>
      <div className="people-lens-tiles mono">
        <div>
          <span>Rent</span>
          <b>{pct(shares.renters)}</b>
        </div>
        <div>
          <span>No car</span>
          <b>{pct(shares.noCar)}</b>
        </div>
        <div>
          <span>Lone hhd</span>
          <b>{pct(shares.loneHh)}</b>
        </div>
        <div>
          <span>WFH</span>
          <b>{pct(shares.wfh)}</b>
        </div>
      </div>
      <div className="people-sub">Drag trail · people under lens</div>
      <Sparkline values={state.trail} />
      {state.pins.length > 0 ? (
        <ul className="people-pins mono" data-testid="people-pins">
          <li>
            <span>Lens (live)</span>
            <b>{fmtInt(live)}</b>
          </li>
          {state.pins.map((pin) => (
            <li key={pin.id}>
              <span>
                Pin {pin.label} · r {pin.radius} m · {pin.result.sa1Codes.length} SA1s
              </span>
              <b>{fmtInt(pin.result.people)}</b>
              <em>{live - pin.result.people >= 0 ? "+" : "−"}{fmtInt(Math.abs(live - pin.result.people))}</em>
              <button type="button" className="people-x" aria-label={`Remove pin ${pin.label}`} onClick={() => store.unpin(pin.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="people-sub people-sub-row">
        <span>Count SA1s</span>
        <span className="people-chips">
          {(["area", "centroid"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={state.method === m}
              className={state.method === m ? "people-chip is-on" : "people-chip"}
              onClick={() => store.setMethod(m)}
            >
              {methodLabel[m]}
            </button>
          ))}
        </span>
      </div>
      <p className="people-note">
        {state.method === "area"
          ? "Estimate: each SA1's counts are scaled by the share of its area inside the lens."
          : "Whole SA1s are counted when their centroid falls inside the lens."}{" "}
        Medians cannot be summed, so the lens shows shares. Census day was 10 August 2021.
      </p>
    </div>
  );
}

const selectCity = (s: PeopleState) => s.city;
const selectSelected = (s: PeopleState) => s.selected;

export function CityView({ store, census, model3d }: { store: PeopleStore; census: OkCensus; model3d: boolean }) {
  const city = usePeople(store, selectCity);
  const selected = usePeople(store, selectSelected);
  const counts = modeCounts(census.site.values);
  const total = workers(census.site.values);
  const sel = selected ? census.sa1.find((s) => s.code === selected) ?? null : null;
  const values = census.sa1.map((s) => prismMetricValue(s, city.metric, city.band));
  return (
    <div className="people-view" data-testid="people-city">
      <p className="people-lede">The model becomes the chart: SA1 prisms rise by the metric you pick. Off by default, so the normal 3D view and exports are unchanged.</p>
      {!model3d ? <p className="people-hint mono">Switch to the 3D model to see Living City.</p> : null}
      <label className="people-switch" data-testid="people-city-toggle">
        <input type="checkbox" checked={city.prisms} onChange={(e) => store.setCity({ prisms: e.target.checked })} />
        <span>SA1 prisms on the 3D model</span>
      </label>
      <div className="people-sub">Height by</div>
      <span className="people-chips is-wrap">
        {PRISM_METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={city.metric === m.id}
            className={city.metric === m.id ? "people-chip is-on" : "people-chip"}
            data-testid={`people-metric-${m.id}`}
            onClick={() => store.setCity({ metric: m.id as PrismMetric, prisms: true })}
          >
            {m.label}
          </button>
        ))}
      </span>
      <div className="people-sub people-sub-row">
        <span>Age band</span>
        <b className="mono">{AGE_BANDS[city.band]?.label}</b>
      </div>
      <input
        type="range"
        className="people-range"
        min={0}
        max={AGE_BANDS.length - 1}
        step={1}
        value={city.band}
        aria-label="Age band"
        data-testid="people-age-slider"
        onChange={(e) => store.setCity({ band: Number(e.target.value), metric: "age", prisms: true })}
      />
      <div className="people-age-ends mono">
        {AGE_BANDS.map((b) => (
          <span key={b.key}>{b.label}</span>
        ))}
      </div>
      <div className="people-map-legend mono" aria-hidden="true">
        <span>{formatPrismValue(Math.min(...values), city.metric)}</span>
        {RAMP.map((fill) => (
          <span key={fill} className="people-swatch" style={{ background: fill }} />
        ))}
        <span>{formatPrismValue(Math.max(...values), city.metric)}</span>
      </div>
      <div className="people-map-tip mono" data-testid="people-city-selected">
        {sel
          ? `SA1 ${sel.code} · ${fmtInt(sel.values.pop)} people · ${formatPrismValue(prismMetricValue(sel, city.metric, city.band), city.metric)}`
          : "Click a prism on the model for its callout."}
      </div>

      <div className="people-sub people-sub-row">
        <span>Travel to work · 1 dot ≈ {PEOPLE_PER_DOT} workers</span>
      </div>
      <label className="people-switch" data-testid="people-dots-toggle">
        <input type="checkbox" checked={city.dots} onChange={(e) => store.setCity({ dots: e.target.checked, playing: e.target.checked && city.playing })} />
        <span>Resident dots by travel mode</span>
      </label>
      <ul className="people-modes">
        {TRAVEL_MODES.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              aria-pressed={city.modes[m.id]}
              className={city.modes[m.id] ? "people-mode is-on" : "people-mode"}
              data-testid={`people-mode-${m.id}`}
              onClick={() => store.toggleMode(m.id)}
            >
              <span className="people-swatch is-round" style={{ background: m.colour }} />
              <span>{m.label}</span>
              <b className="mono">{total > 0 ? pct(counts[m.id] / total) : "–"}</b>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={city.playing ? "people-btn is-on" : "people-btn"}
        data-testid="people-play"
        aria-pressed={city.playing}
        onClick={() => store.setCity({ playing: !city.playing, dots: true })}
      >
        {city.playing ? "❚❚ Pause commute" : "▶ Play commute"}
      </button>
      <p className="people-note">
        Dot positions inside each SA1 are illustrative; mode counts are real. On play, non-WFH dots head toward the Melbourne CBD and stop at the cut edge. Census day fell in the August 2021 lockdown, so WFH is high.
      </p>
    </div>
  );
}

export function DeckView({ store, census }: { store: PeopleStore; census: OkCensus }) {
  const v = census.site.values;
  const gm = census.greaterMelbourne;
  const deck = useMemo(() => buildDeck(v, gm), [v, gm]);
  const quiz = useMemo(() => buildQuiz(v, gm), [v, gm]);
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState(1);
  const [shown, setShown] = useState<string | null>(null);
  const [q, setQ] = useState(0);
  const [guess, setGuess] = useState(0.3);
  const [flipped, setFlipped] = useState<null | { hit: boolean; offPts: number }>(null);
  const [streak, setStreak] = useState(0);
  const swipe = useRef<{ x: number; id: number } | null>(null);
  const [dx, setDx] = useState(0);
  const card = deck[at];
  const go = useCallback(
    (step: number) => {
      setAt((i) => {
        const next = Math.max(0, Math.min(deck.length - 1, i + step));
        setSeen((s) => Math.max(s, next + 1));
        return next;
      });
    },
    [deck.length],
  );
  useEffect(() => () => store.setHighlight(null), [store]);
  const cells = deckGrid(deck, seen);
  const met = cells.filter((c) => c !== null).length;
  const question = quiz[q % quiz.length];
  const showOnModel = () => {
    if (shown === card.id) {
      store.setHighlight(null);
      setShown(null);
      return;
    }
    const codes = matchingSa1s(census.sa1, card);
    store.setHighlight({ codes, label: card.title });
    store.setCity({ prisms: true, metric: card.prism.metric, band: card.ageBand ?? card.prism.band });
    setShown(card.id);
  };
  const highlightCount = shown === card.id ? matchingSa1s(census.sa1, card).length : null;
  return (
    <div
      className="people-view"
      data-testid="people-deck"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(1);
        if (e.key === "ArrowLeft") go(-1);
      }}
    >
      <div className="people-deck-title">If the {fmtInt(v.pop)} people in this cut were 100 people…</div>
      <div className="people-deck-grid" role="img" aria-label="100 neighbours met so far" data-testid="people-deck-grid" data-met={met}>
        {cells.map((c, i) => (
          <span key={i} className={c === null ? "people-deck-cell" : "people-deck-cell is-met"} style={c === null ? undefined : { background: deck[c].colour }} />
        ))}
      </div>
      <div className="people-kpi-lbl mono">
        Met {met} / 100 · {Math.min(seen, AGE_BANDS.length)} of {AGE_BANDS.length} age cards
      </div>
      <div className="people-deck-stack">
        <span className="people-deck-under is-2" />
        <span className="people-deck-under is-1" />
        <article
          className="people-deck-card"
          data-testid="people-deck-card"
          data-card={card.id}
          style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)` }}
          onPointerDown={(e) => {
            swipe.current = { x: e.clientX, id: e.pointerId };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (swipe.current) setDx(e.clientX - swipe.current.x);
          }}
          onPointerUp={(e) => {
            const start = swipe.current;
            swipe.current = null;
            setDx(0);
            if (!start) return;
            const d = e.clientX - start.x;
            if (d <= -SWIPE_PX) go(1);
            else if (d >= SWIPE_PX) go(-1);
          }}
          onPointerCancel={() => {
            swipe.current = null;
            setDx(0);
          }}
        >
          <div className="people-kicker mono">{card.kicker}</div>
          <div className="people-deck-big">
            <b style={{ color: card.colour }}>{card.ofHundred}</b>
            <span>of every 100 {card.unit}</span>
          </div>
          <div className="people-deck-name">{card.title}</div>
          <p>
            {fmtInt(card.count)} {card.unit} · {pct(card.share)} here vs {pct(card.gmShare)} in Greater Melbourne
          </p>
          {card.caveat ? <p className="people-note">{card.caveat}</p> : null}
        </article>
      </div>
      <div className="people-deck-nav">
        <button type="button" className="people-btn" disabled={at === 0} onClick={() => go(-1)} data-testid="people-deck-back">
          ← Back
        </button>
        <button type="button" className={shown === card.id ? "people-btn is-on" : "people-btn"} onClick={showOnModel} data-testid="people-deck-show">
          ↑ Show on model
        </button>
        <button type="button" className="people-btn is-primary" disabled={at === deck.length - 1} onClick={() => go(1)} data-testid="people-deck-next">
          Next →
        </button>
      </div>
      <div className="people-kpi-lbl mono" data-testid="people-deck-pos">
        Card {at + 1} of {deck.length} · swipe or ← →
        {highlightCount !== null ? ` · ${highlightCount} SA1s above the cut's ${pct(card.share)} lit` : ""}
      </div>

      <div className="people-quiz" data-testid="people-quiz">
        <div className="people-sub">Guess before you flip</div>
        <p>{question.prompt}</p>
        <input
          type="range"
          className="people-range"
          min={0}
          max={100}
          step={1}
          value={Math.round(guess * 100)}
          disabled={flipped !== null}
          aria-label="Your guess"
          data-testid="people-quiz-guess"
          onChange={(e) => setGuess(Number(e.target.value) / 100)}
        />
        <div className="people-age-ends mono">
          <span>You: {pct(guess)}</span>
          {flipped ? <span data-testid="people-quiz-real">Real: {pct(question.real)}</span> : null}
        </div>
        {flipped ? (
          <p className="people-quiz-result" data-testid="people-quiz-result">
            {flipped.hit ? "Within 5 points." : `Off by ${flipped.offPts} pts.`} {question.detail} Greater Melbourne: {pct(question.gm)}.
          </p>
        ) : null}
        <div className="people-deck-nav">
          {flipped ? (
            <button
              type="button"
              className="people-btn is-primary"
              data-testid="people-quiz-next"
              onClick={() => {
                setFlipped(null);
                setQ((n) => n + 1);
                setGuess(0.3);
              }}
            >
              Next question
            </button>
          ) : (
            <button
              type="button"
              className="people-btn is-primary"
              data-testid="people-quiz-flip"
              onClick={() => {
                const r = scoreGuess(guess, question.real, streak);
                setStreak(r.streak);
                setFlipped({ hit: r.hit, offPts: r.offPts });
              }}
            >
              Flip
            </button>
          )}
          <span className="mono people-streak" data-testid="people-quiz-streak">
            Streak {streak}
          </span>
        </div>
      </div>
      <p className="people-note">Every card is this cut's ABS Census 2021 SA1 totals, apportioned by area where an SA1 is cut.</p>
    </div>
  );
}
