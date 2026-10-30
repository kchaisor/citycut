import { useCallback, useSyncExternalStore } from "react";
import type { CensusSiteResult } from "./censusPeople";
import { fromLocal } from "./geo";
import { aggregateLens, buildLensIndex, clampLensCentre, type LensIndex, type LensMethod, type LensResult } from "./peopleLens";
import { TRAVEL_MODES, type PrismMetric, type TravelMode } from "./peopleMetrics";
import type { SiteFrameShape } from "./siteFrame";
import { estimateArea, walkCacheKey, type WalkArea, type WalkIsochroneService, type WalkMinutes, type WalkPolygons } from "./walkIsochrone";
import type { LonLat, Pt } from "../types";

export type PeopleView = "lens" | "city" | "deck" | "profile";

export type LensPin = { id: string; label: string; centre: Pt; area: WalkArea; method: LensMethod; result: LensResult };

export type PeopleHighlight = { codes: string[]; label: string };

export type PeopleCityState = {
  prisms: boolean;
  metric: PrismMetric;
  band: number;
  dots: boolean;
  modes: Record<TravelMode, boolean>;
  playing: boolean;
};

export type PeopleState = {
  active: boolean;
  census: CensusSiteResult | null;
  index: LensIndex | null;
  view: PeopleView;
  centre: Pt;
  minutes: WalkMinutes;
  walk: WalkArea;
  method: LensMethod;
  lens: LensResult | null;
  trail: number[];
  dragging: boolean;
  pins: LensPin[];
  city: PeopleCityState;
  selected: string | null;
  highlight: PeopleHighlight | null;
};

export const TRAIL_LENGTH = 48;
export const WALK_SETTLE_MS = 350;
const PIN_LABELS = ["A", "B", "C"];

export function initialPeopleState(): PeopleState {
  return {
    active: false,
    census: null,
    index: null,
    view: "lens",
    centre: [0, 0],
    minutes: 5,
    walk: estimateArea([0, 0], 5, "pending", null),
    method: "area",
    lens: null,
    trail: [],
    dragging: false,
    pins: [],
    city: {
      prisms: false,
      metric: "population",
      band: 2,
      dots: false,
      modes: Object.fromEntries(TRAVEL_MODES.map((m) => [m.id, true])) as Record<TravelMode, boolean>,
      playing: false,
    },
    selected: null,
    highlight: null,
  };
}

export class PeopleStore {
  private state: PeopleState = initialPeopleState();
  private readonly listeners = new Set<() => void>();
  private contours: { key: string; centre: Pt; polygons: Record<WalkMinutes, WalkPolygons> } | null = null;
  private failure: { key: string; area: Pick<WalkArea, "reason"> } | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: AbortController | null = null;

  constructor(
    readonly sideM: number,
    readonly shape: SiteFrameShape,
    readonly origin: LonLat | null = null,
    private readonly walkService: WalkIsochroneService | null = null,
    private readonly settleMs = WALK_SETTLE_MS,
  ) {}

  get = (): PeopleState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<PeopleState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  setActive(active: boolean): void {
    if (this.state.active !== active) this.set({ active, dragging: false, city: { ...this.state.city, playing: active && this.state.city.playing } });
  }

  setCensus(census: CensusSiteResult | null): void {
    if (this.state.census === census) return;
    const index = census?.status === "ok" ? buildLensIndex(census.sa1, this.sideM, this.shape) : null;
    const walk = this.walkFor(this.state.centre, this.state.minutes);
    const lens = index ? aggregateLens(index, walk.polygons, this.state.method) : null;
    this.set({ census, index, walk, lens, trail: lens ? [lens.people] : [], pins: [], selected: null, highlight: null });
    if (index) this.requestWalk(0);
  }

  setView(view: PeopleView): void {
    this.set({ view });
  }

  private keyFor(centre: Pt): string | null {
    return this.origin ? walkCacheKey(fromLocal(centre, this.origin)) : null;
  }

  private walkFor(centre: Pt, minutes: WalkMinutes): WalkArea {
    const key = this.keyFor(centre);
    if (key && this.contours?.key === key) {
      return { minutes, centre, polygons: this.contours.polygons[minutes], status: "live", reason: null };
    }
    if (!this.origin || !this.walkService) return estimateArea(centre, minutes, "fallback", "blocked");
    if (key && this.failure?.key === key) return estimateArea(centre, minutes, "fallback", this.failure.area.reason);
    if (this.walkService.unavailable) return estimateArea(centre, minutes, "fallback", "blocked");
    const cached = this.walkService.cached(fromLocal(centre, this.origin));
    if (cached && key) {
      this.contours = { key, centre, polygons: cached };
      return { minutes, centre, polygons: cached[minutes], status: "live", reason: null };
    }
    return estimateArea(centre, minutes, "pending", null);
  }

  private recompute(centre: Pt, minutes: WalkMinutes, method: LensMethod, extendTrail: boolean): void {
    const { index } = this.state;
    const walk = this.walkFor(centre, minutes);
    const lens = index ? aggregateLens(index, walk.polygons, method) : null;
    const trail = lens ? (extendTrail ? [...this.state.trail, lens.people].slice(-TRAIL_LENGTH) : [lens.people]) : [];
    this.set({ centre, minutes, walk, method, lens, trail });
  }

  private requestWalk(delayMs: number): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    if (this.state.walk.status !== "pending" || !this.origin || !this.walkService) return;
    if (delayMs > 0) {
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null;
        this.requestWalk(0);
      }, delayMs);
      return;
    }
    const centre = this.state.centre;
    const key = this.keyFor(centre);
    if (!key) return;
    this.inflight?.abort();
    const controller = new AbortController();
    this.inflight = controller;
    void this.walkService.request(fromLocal(centre, this.origin), this.origin, controller.signal).then((result) => {
      if (this.inflight === controller) this.inflight = null;
      if (controller.signal.aborted && result.status !== "ok") return;
      if (result.status === "ok") {
        this.contours = { key, centre, polygons: result.contours };
        this.failure = null;
      } else {
        this.failure = { key, area: { reason: result.reason } };
      }
      if (this.keyFor(this.state.centre) !== key || this.state.dragging) return;
      this.recompute(this.state.centre, this.state.minutes, this.state.method, true);
    });
  }

  moveLens(centre: Pt): void {
    this.recompute(clampLensCentre(centre, this.sideM, this.shape), this.state.minutes, this.state.method, true);
    if (!this.state.dragging) this.requestWalk(this.settleMs);
  }

  setMinutes(minutes: WalkMinutes): void {
    this.recompute(this.state.centre, minutes, this.state.method, false);
  }

  setMethod(method: LensMethod): void {
    this.recompute(this.state.centre, this.state.minutes, method, false);
    const { index } = this.state;
    if (index) {
      this.set({
        pins: this.state.pins.map((pin) => ({ ...pin, method, result: aggregateLens(index, pin.area.polygons, method) })),
      });
    }
  }

  setDragging(dragging: boolean): void {
    if (this.state.dragging === dragging) return;
    if (dragging) {
      if (this.settleTimer) clearTimeout(this.settleTimer);
      this.settleTimer = null;
      this.set({ dragging, trail: this.state.lens ? [this.state.lens.people] : [] });
      return;
    }
    this.set({ dragging });
    this.requestWalk(0);
  }

  dispose(): void {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.inflight?.abort();
    this.inflight = null;
  }

  pin(): void {
    const { lens, pins, centre, walk, method } = this.state;
    if (!lens) return;
    const used = new Set(pins.map((p) => p.label));
    const label = PIN_LABELS.find((l) => !used.has(l));
    if (!label) return;
    this.set({ pins: [...pins, { id: `${label}-${Date.now()}`, label, centre, area: walk, method, result: lens }] });
  }

  unpin(id: string): void {
    this.set({ pins: this.state.pins.filter((p) => p.id !== id) });
  }

  setCity(patch: Partial<PeopleCityState>): void {
    this.set({ city: { ...this.state.city, ...patch } });
  }

  toggleMode(mode: TravelMode): void {
    this.setCity({ modes: { ...this.state.city.modes, [mode]: !this.state.city.modes[mode] } });
  }

  select(code: string | null): void {
    if (this.state.selected !== code) this.set({ selected: code });
  }

  setHighlight(highlight: PeopleHighlight | null): void {
    this.set({ highlight });
  }
}

export function usePeople<T>(store: PeopleStore, selector: (state: PeopleState) => T): T {
  const get = useCallback(() => selector(store.get()), [store, selector]);
  return useSyncExternalStore(store.subscribe, get, get);
}
