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

export type SectionCutStore = {
  get: () => SectionCutState;
  set: (patch: Partial<SectionCutState>) => void;
  subscribe: (listener: Listener) => () => void;
};

export function createSectionCutStore(initial: SectionCutState = DEFAULT_SECTION_CUT): SectionCutStore {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set: (patch) => {
      const next = { ...state, ...patch };
      if (
        next.enabled === state.enabled &&
        next.angleDeg === state.angleDeg &&
        next.offsetM === state.offsetM &&
        next.flipped === state.flipped &&
        next.fill === state.fill
      ) {
        return;
      }
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
