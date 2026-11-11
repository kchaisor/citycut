import { defaultSectionKnifePose, type SectionKnifePose } from "./plane";
import type { SnapEdgeKind } from "./snap";

export type SectionKnifeEntry = {
  id: string;
  label: string;
  pose: SectionKnifePose;
};

export type SectionKnifeSnapCue = {
  kind: SnapEdgeKind;
  east: number;
  north: number;
  untilMs: number;
};

export type SectionKnifeToolState = {
  active: boolean;
  selectedId: string;
  knives: SectionKnifeEntry[];
  snap: boolean;
  snapCue: SectionKnifeSnapCue | null;
};

let knifeSerial = 0;

export function createSectionKnifeEntry(sideM: number, label?: string): SectionKnifeEntry {
  knifeSerial += 1;
  const id = `knife-${knifeSerial}`;
  return {
    id,
    label: label ?? `Section Knife ${String.fromCharCode(64 + ((knifeSerial - 1) % 26) + 1)}`,
    pose: defaultSectionKnifePose(sideM),
  };
}

export function initialSectionKnifeToolState(sideM: number): SectionKnifeToolState {
  const first = createSectionKnifeEntry(sideM, "Section Knife A");
  return { active: false, selectedId: first.id, knives: [first], snap: true, snapCue: null };
}

export function selectedKnife(state: SectionKnifeToolState): SectionKnifeEntry {
  return state.knives.find((k) => k.id === state.selectedId) ?? state.knives[0];
}
