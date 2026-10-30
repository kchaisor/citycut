import { useCallback, useSyncExternalStore } from "react";
import type { CensusSiteResult } from "./censusPeople";
import { aggregateLens, buildLensIndex, clampLensCentre, type LensIndex, type LensMethod, type LensResult } from "./peopleLens";
import { TRAVEL_MODES, type PrismMetric, type TravelMode } from "./peopleMetrics";
import type { SiteFrameShape } from "./siteFrame";
import type { Pt } from "../types";

export type PeopleView = "lens" | "city" | "deck" | "profile";

export type LensPin = { id: string; label: string; centre: Pt; radius: number; method: LensMethod; result: LensResult };

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
  radius: number;
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
const PIN_LABELS = ["A", "B", "C"];

export function initialPeopleState(): PeopleState {
  return {
    active: false,
    census: null,
    index: null,
    view: "lens",
    centre: [0, 0],
    radius: 200,
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

  constructor(
    readonly sideM: number,
    readonly shape: SiteFrameShape,
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
    const lens = index ? aggregateLens(index, this.state.centre, this.state.radius, this.state.method) : null;
    this.set({ census, index, lens, trail: lens ? [lens.people] : [], pins: [], selected: null, highlight: null });
  }

  setView(view: PeopleView): void {
    this.set({ view });
  }

  private recompute(centre: Pt, radius: number, method: LensMethod, extendTrail: boolean): void {
    const { index } = this.state;
    const lens = index ? aggregateLens(index, centre, radius, method) : null;
    const trail = lens ? (extendTrail ? [...this.state.trail, lens.people].slice(-TRAIL_LENGTH) : [lens.people]) : [];
    this.set({ centre, radius, method, lens, trail });
  }

  moveLens(centre: Pt): void {
    this.recompute(clampLensCentre(centre, this.sideM, this.shape), this.state.radius, this.state.method, true);
  }

  setRadius(radius: number): void {
    this.recompute(this.state.centre, radius, this.state.method, false);
  }

  setMethod(method: LensMethod): void {
    this.recompute(this.state.centre, this.state.radius, method, false);
    const { index } = this.state;
    if (index) {
      this.set({
        pins: this.state.pins.map((pin) => ({ ...pin, method, result: aggregateLens(index, pin.centre, pin.radius, method) })),
      });
    }
  }

  setDragging(dragging: boolean): void {
    if (this.state.dragging === dragging) return;
    this.set(dragging ? { dragging, trail: this.state.lens ? [this.state.lens.people] : [] } : { dragging });
  }

  pin(): void {
    const { lens, pins, centre, radius, method } = this.state;
    if (!lens) return;
    const used = new Set(pins.map((p) => p.label));
    const label = PIN_LABELS.find((l) => !used.has(l));
    if (!label) return;
    this.set({ pins: [...pins, { id: `${label}-${Date.now()}`, label, centre, radius, method, result: lens }] });
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
