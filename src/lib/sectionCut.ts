export type SectionFill = "solid" | "hatch";

export type SectionCutState = {
  enabled: boolean;
  angleDeg: number;
  offsetM: number;
  flipped: boolean;
  fill: SectionFill;
};

export const SECTION_OFFSET_STEP_M = 5;
export const SECTION_SNAP_RADIUS_M = 1.25;
export const SECTION_ANGLE_STEP_DEG = 15;

export const DEFAULT_SECTION_CUT: SectionCutState = {
  enabled: false,
  angleDeg: 0,
  offsetM: 0,
  flipped: false,
  fill: "solid",
};

export function normalizeAngle(deg: number): number {
  const wrapped = ((deg % 180) + 180) % 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function rotateAngle(deg: number, steps: number): number {
  const snapped = Math.round(deg / SECTION_ANGLE_STEP_DEG) * SECTION_ANGLE_STEP_DEG;
  return normalizeAngle(snapped + steps * SECTION_ANGLE_STEP_DEG);
}

export function sectionNormalEN(angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [-Math.sin(a), Math.cos(a)];
}

export function offsetFromPoint(east: number, north: number, angleDeg: number): number {
  const [ne, nn] = sectionNormalEN(angleDeg);
  return ne * east + nn * north;
}

export function maxOffsetM(sideM: number): number {
  return (sideM / 2) * Math.SQRT2;
}

export function clampOffset(offsetM: number, sideM: number): number {
  const limit = maxOffsetM(sideM);
  return Math.min(limit, Math.max(-limit, offsetM));
}

export type SnapResult = { offsetM: number; snapped: boolean };

export function snapOffset(rawM: number, sideM: number, free = false): SnapResult {
  const clamped = clampOffset(rawM, sideM);
  if (free) return { offsetM: clamped, snapped: false };
  const target = Math.round(clamped / SECTION_OFFSET_STEP_M) * SECTION_OFFSET_STEP_M;
  if (Math.abs(target - clamped) <= SECTION_SNAP_RADIUS_M) {
    return { offsetM: clampOffset(target, sideM), snapped: true };
  }
  return { offsetM: clamped, snapped: false };
}

export function settleOffset(offsetM: number, sideM: number): number {
  return clampOffset(Math.round(offsetM / SECTION_OFFSET_STEP_M) * SECTION_OFFSET_STEP_M, sideM);
}

export type WorldPlane = { normal: [number, number, number]; constant: number };

export function sectionWorldPlane(state: Pick<SectionCutState, "angleDeg" | "offsetM" | "flipped">): WorldPlane {
  const [ne, nn] = sectionNormalEN(state.angleDeg);
  const sign = state.flipped ? 1 : -1;
  const constant = state.flipped ? -state.offsetM : state.offsetM;
  return { normal: [sign * ne, 0, -sign * nn], constant: constant === 0 ? 0 : constant };
}

export function keepsPoint(state: Pick<SectionCutState, "angleDeg" | "offsetM" | "flipped">, east: number, north: number): boolean {
  const plane = sectionWorldPlane(state);
  const x = east;
  const z = -north;
  return plane.normal[0] * x + plane.normal[2] * z + plane.constant >= 0;
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function lookingDirection(state: Pick<SectionCutState, "angleDeg" | "flipped">): string {
  const [ne, nn] = sectionNormalEN(state.angleDeg);
  const sign = state.flipped ? 1 : -1;
  const bearing = (((Math.atan2(sign * ne, sign * nn) * 180) / Math.PI) + 360) % 360;
  return COMPASS[Math.round(bearing / 45) % 8];
}

export function formatOffset(offsetM: number): string {
  const rounded = Math.round(offsetM * 10) / 10;
  if (rounded === 0) return "0.0 m";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)} m`;
}

export function cutLineEndpoints(state: Pick<SectionCutState, "angleDeg" | "offsetM">, sideM: number): [[number, number], [number, number]] {
  const [ne, nn] = sectionNormalEN(state.angleDeg);
  const a = (state.angleDeg * Math.PI) / 180;
  const de = Math.cos(a);
  const dn = Math.sin(a);
  const half = maxOffsetM(sideM);
  const ce = ne * state.offsetM;
  const cn = nn * state.offsetM;
  return [
    [ce - de * half, cn - dn * half],
    [ce + de * half, cn + dn * half],
  ];
}

type Listener = () => void;

export type SectionCutDef = {
  id: number;
  label: string;
  angleDeg: number;
  offsetM: number;
  flipped: boolean;
  fill: SectionFill;
};

export type SectionSet = {
  enabled: boolean;
  cuts: SectionCutDef[];
  activeId: number;
  hoverBuildingId: number | null;
  drawingOpen: boolean;
};

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const MAX_SECTION_CUTS = 6;

export function nextSectionLabel(cuts: readonly Pick<SectionCutDef, "label">[]): string {
  const used = new Set(cuts.map((cut) => cut.label));
  for (const letter of LETTERS) if (!used.has(letter)) return letter;
  return `S${cuts.length + 1}`;
}

export function sectionTitle(label: string): string {
  return `${label}–${label}′`;
}

export function activeCut(set: SectionSet): SectionCutDef {
  return set.cuts.find((cut) => cut.id === set.activeId) ?? set.cuts[0];
}

function viewOf(set: SectionSet): SectionCutState {
  const cut = activeCut(set);
  return { enabled: set.enabled, angleDeg: cut.angleDeg, offsetM: cut.offsetM, flipped: cut.flipped, fill: cut.fill };
}

export function initialSectionSet(initial: SectionCutState = DEFAULT_SECTION_CUT): SectionSet {
  return {
    enabled: initial.enabled,
    cuts: [{ id: 1, label: "A", angleDeg: initial.angleDeg, offsetM: initial.offsetM, flipped: initial.flipped, fill: initial.fill }],
    activeId: 1,
    hoverBuildingId: null,
    drawingOpen: false,
  };
}

export function addSectionCut(set: SectionSet): SectionSet {
  if (set.cuts.length >= MAX_SECTION_CUTS) return set;
  const from = activeCut(set);
  const id = Math.max(...set.cuts.map((cut) => cut.id)) + 1;
  const cut: SectionCutDef = {
    id,
    label: nextSectionLabel(set.cuts),
    angleDeg: normalizeAngle(from.angleDeg + 90),
    offsetM: 0,
    flipped: false,
    fill: from.fill,
  };
  return { ...set, enabled: true, cuts: [...set.cuts, cut], activeId: id };
}

export function removeSectionCut(set: SectionSet, id: number): SectionSet {
  if (set.cuts.length <= 1) return { ...set, enabled: false, drawingOpen: false };
  const cuts = set.cuts.filter((cut) => cut.id !== id);
  if (cuts.length === set.cuts.length) return set;
  const activeId = set.activeId === id ? cuts[cuts.length - 1].id : set.activeId;
  return { ...set, cuts, activeId };
}

export type SectionCutStore = {
  get: () => SectionCutState;
  set: (patch: Partial<SectionCutState>) => void;
  subscribe: (listener: Listener) => () => void;
  getSet: () => SectionSet;
  update: (next: (set: SectionSet) => SectionSet) => void;
};

export function createSectionCutStore(initial: SectionCutState = DEFAULT_SECTION_CUT): SectionCutStore {
  let all = initialSectionSet(initial);
  let view = viewOf(all);
  const listeners = new Set<Listener>();
  const commit = (next: SectionSet) => {
    if (next === all) return;
    all = next;
    const nextView = viewOf(next);
    if (
      nextView.enabled !== view.enabled ||
      nextView.angleDeg !== view.angleDeg ||
      nextView.offsetM !== view.offsetM ||
      nextView.flipped !== view.flipped ||
      nextView.fill !== view.fill
    ) {
      view = nextView;
    }
    for (const listener of listeners) listener();
  };
  return {
    get: () => view,
    getSet: () => all,
    set: (patch) => {
      const { enabled, ...cutPatch } = patch;
      const cut = activeCut(all);
      const nextCut = { ...cut, ...cutPatch };
      const cutSame =
        nextCut.angleDeg === cut.angleDeg &&
        nextCut.offsetM === cut.offsetM &&
        nextCut.flipped === cut.flipped &&
        nextCut.fill === cut.fill;
      const nextEnabled = enabled ?? all.enabled;
      if (cutSame && nextEnabled === all.enabled) return;
      commit({
        ...all,
        enabled: nextEnabled,
        drawingOpen: nextEnabled ? all.drawingOpen : false,
        cuts: cutSame ? all.cuts : all.cuts.map((entry) => (entry.id === cut.id ? nextCut : entry)),
      });
    },
    update: (next) => commit(next(all)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
