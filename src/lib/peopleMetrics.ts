import { AGE_BANDS, hundredPeople, share, type CensusValues, type SelectedSa1 } from "./censusPeople";

export const PRISM_METRICS = [
  { id: "population", label: "People" },
  { id: "density", label: "Density" },
  { id: "age", label: "Age band" },
  { id: "renters", label: "Renters" },
  { id: "noCar", label: "No car" },
  { id: "wfh", label: "WFH" },
] as const;

export type PrismMetric = (typeof PRISM_METRICS)[number]["id"];

const SHARE_METRICS: ReadonlySet<PrismMetric> = new Set(["age", "renters", "noCar", "wfh"]);

export function isShareMetric(metric: PrismMetric): boolean {
  return SHARE_METRICS.has(metric);
}

export function ageShare(v: CensusValues, band: number): number {
  const counts = AGE_BANDS.map((b) => v[b.key]);
  return share(counts[band] ?? 0, counts);
}

export function renterShare(v: CensusValues): number {
  return share(v.tenRent, [v.tenOwned, v.tenMortgage, v.tenRent, v.tenOther]);
}

export function noCarShare(v: CensusValues): number {
  return share(v.car0, [v.car0, v.car1, v.car2, v.car3p]);
}

export function loneShare(v: CensusValues): number {
  return share(v.hhLone, [v.hhFamily, v.hhLone, v.hhGroup]);
}

export function workers(v: CensusValues): number {
  return v.twCar + v.twPt + v.twActive + v.twMulti + v.twHome + v.twOther;
}

export function wfhShare(v: CensusValues): number {
  const total = workers(v);
  return total > 0 ? v.twHome / total : 0;
}

export function ptShare(v: CensusValues): number {
  const total = workers(v);
  return total > 0 ? v.twPt / total : 0;
}

export function sa1DensityPerKm2(sa1: Pick<SelectedSa1, "values" | "fraction" | "clippedKm2">): number {
  const full = sa1.fraction > 0 ? sa1.clippedKm2 / sa1.fraction : 0;
  return full > 0 ? sa1.values.pop / full : 0;
}

export function prismMetricValue(
  sa1: Pick<SelectedSa1, "values" | "fraction" | "clippedKm2">,
  metric: PrismMetric,
  band = 2,
): number {
  const v = sa1.values;
  if (metric === "population") return v.pop * sa1.fraction;
  if (metric === "density") return sa1DensityPerKm2(sa1);
  if (metric === "age") return ageShare(v, band);
  if (metric === "renters") return renterShare(v);
  if (metric === "noCar") return noCarShare(v);
  return wfhShare(v);
}

export function prismMaxHeightM(sideM: number): number {
  return Math.max(40, sideM * 0.3);
}

export function prismHeights(values: readonly number[], metric: PrismMetric, maxHeightM: number): number[] {
  if (isShareMetric(metric)) return values.map((v) => Math.max(0, Math.min(1, v)) * maxHeightM);
  const max = values.reduce((m, v) => (Number.isFinite(v) ? Math.max(m, v) : m), 0);
  return values.map((v) => (max > 0 && Number.isFinite(v) ? (Math.max(0, v) / max) * maxHeightM : 0));
}

export function prismSteps(heights: readonly number[], maxHeightM: number, steps = 5): number[] {
  return heights.map((h) => (maxHeightM > 0 ? Math.min(steps - 1, Math.floor((h / maxHeightM) * steps)) : 0));
}

export function formatPrismValue(value: number, metric: PrismMetric): string {
  if (metric === "population") return `${Math.round(value).toLocaleString("en-AU")} people`;
  if (metric === "density") return `${Math.round(value).toLocaleString("en-AU")}/km²`;
  return `${Math.round(value * 100)}%`;
}

export const TRAVEL_MODES = [
  { id: "pt", label: "Public transport", colour: "var(--people-mode-pt)", key: "--people-mode-pt" },
  { id: "active", label: "Walk / cycle", colour: "var(--people-mode-active)", key: "--people-mode-active" },
  { id: "car", label: "Car", colour: "var(--people-mode-car)", key: "--people-mode-car" },
  { id: "home", label: "Worked from home", colour: "var(--people-mode-home)", key: "--people-mode-home" },
  { id: "other", label: "Multi-mode / other", colour: "var(--people-mode-other)", key: "--people-mode-other" },
] as const;

export type TravelMode = (typeof TRAVEL_MODES)[number]["id"];

export function modeCounts(v: CensusValues): Record<TravelMode, number> {
  return { pt: v.twPt, active: v.twActive, car: v.twCar, home: v.twHome, other: v.twMulti + v.twOther };
}

export const PEOPLE_PER_DOT = 10;

export function apportion(counts: readonly number[], total: number): number[] {
  const sum = counts.reduce((s, n) => s + Math.max(0, n), 0);
  if (sum <= 0 || total <= 0) return counts.map(() => 0);
  const exact = counts.map((n) => (Math.max(0, n) / sum) * total);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((s, n) => s + n, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    out[index] += 1;
    left -= 1;
  }
  return out;
}

export function sa1DotModes(sa1: Pick<SelectedSa1, "values" | "fraction">): TravelMode[] {
  const counts = modeCounts(sa1.values);
  const ids = TRAVEL_MODES.map((m) => m.id);
  const total = Math.round((workers(sa1.values) * sa1.fraction) / PEOPLE_PER_DOT);
  const per = apportion(
    ids.map((id) => counts[id]),
    total,
  );
  return ids.flatMap((id, i) => Array.from({ length: per[i] }, () => id));
}

export type CardShareFn = (v: CensusValues) => number;

export type NeighbourCard = {
  id: string;
  group: "age" | "fact";
  kicker: string;
  title: string;
  ofHundred: number;
  unit: string;
  count: number;
  gmShare: number;
  share: number;
  shareOf: CardShareFn;
  colour: string;
  ageBand: number | null;
  prism: { metric: PrismMetric; band: number };
  caveat?: string;
};

export const AGE_CARD_COLOURS = [
  "var(--people-1)",
  "var(--people-2)",
  "var(--people-3)",
  "var(--people-4)",
  "var(--people-5)",
  "var(--people-mode-pt)",
  "var(--people-mode-active)",
];

export function buildDeck(v: CensusValues, gm: CensusValues): NeighbourCard[] {
  const ageCounts = AGE_BANDS.map((b) => v[b.key]);
  const gmAge = AGE_BANDS.map((b) => gm[b.key]);
  const hundred = hundredPeople(ageCounts);
  const ages: NeighbourCard[] = AGE_BANDS.map((b, i) => ({
    id: `age-${b.key}`,
    group: "age",
    kicker: `Age · card ${i + 1} of ${AGE_BANDS.length}`,
    title: `The ${b.label}s`,
    ofHundred: hundred[i],
    unit: "neighbours",
    count: ageCounts[i],
    share: share(ageCounts[i], ageCounts),
    gmShare: share(gmAge[i], gmAge),
    shareOf: (x) => ageShare(x, i),
    colour: AGE_CARD_COLOURS[i],
    ageBand: i,
    prism: { metric: "age", band: i },
  }));
  const fact = (
    id: string,
    kicker: string,
    title: string,
    unit: string,
    fn: CardShareFn,
    count: number,
    colour: string,
    prism: PrismMetric,
    caveat?: string,
  ): NeighbourCard => ({
    id,
    group: "fact",
    kicker,
    title,
    ofHundred: Math.round(fn(v) * 100),
    unit,
    count,
    share: fn(v),
    gmShare: fn(gm),
    shareOf: fn,
    colour,
    ageBand: null,
    prism: { metric: prism, band: 2 },
    caveat,
  });
  return [
    ...ages,
    fact("lone", "Household", "Live alone", "households", loneShare, v.hhLone, "var(--people-4)", "population"),
    fact("rent", "Tenure", "Rent their home", "dwellings", renterShare, v.tenRent, "var(--people-3)", "renters"),
    fact("nocar", "Cars", "Have no car", "dwellings", noCarShare, v.car0, "var(--people-mode-car)", "noCar"),
    fact(
      "wfh",
      "Commute",
      "Worked from home",
      "workers",
      wfhShare,
      v.twHome,
      "var(--people-mode-home)",
      "wfh",
      "Census day fell in the August 2021 Melbourne lockdown.",
    ),
  ];
}

export function matchingSa1s(sa1: readonly Pick<SelectedSa1, "code" | "values">[], card: Pick<NeighbourCard, "shareOf" | "share">): string[] {
  return sa1.filter((s) => s.values.pop > 0 && card.shareOf(s.values) > card.share).map((s) => s.code);
}

export function deckGrid(deck: readonly NeighbourCard[], seen: number): (number | null)[] {
  const cells: (number | null)[] = [];
  deck.forEach((card, i) => {
    if (card.group !== "age") return;
    for (let k = 0; k < card.ofHundred; k += 1) cells.push(i < seen ? i : null);
  });
  while (cells.length < 100) cells.push(null);
  return cells.slice(0, 100);
}

export type QuizQuestion = { id: string; prompt: string; real: number; gm: number; detail: string };

export const QUIZ_TOLERANCE = 0.05;

export function buildQuiz(v: CensusValues, gm: CensusValues): QuizQuestion[] {
  const fmt = (n: number) => Math.round(n).toLocaleString("en-AU");
  return [
    {
      id: "wfh",
      prompt: "What share of workers here worked from home on Census day?",
      real: wfhShare(v),
      gm: wfhShare(gm),
      detail: `${fmt(v.twHome)} of ${fmt(workers(v))} workers. Census day fell in the August 2021 lockdown.`,
    },
    {
      id: "rent",
      prompt: "What share of homes here are rented?",
      real: renterShare(v),
      gm: renterShare(gm),
      detail: `${fmt(v.tenRent)} rented dwellings.`,
    },
    {
      id: "nocar",
      prompt: "What share of homes here have no car?",
      real: noCarShare(v),
      gm: noCarShare(gm),
      detail: `${fmt(v.car0)} dwellings with no car.`,
    },
    {
      id: "lone",
      prompt: "What share of households here are one person?",
      real: loneShare(v),
      gm: loneShare(gm),
      detail: `${fmt(v.hhLone)} lone-person households.`,
    },
    {
      id: "a25",
      prompt: "What share of residents here are aged 25–34?",
      real: ageShare(v, 2),
      gm: ageShare(gm, 2),
      detail: `${fmt(v.a25_34)} people aged 25–34.`,
    },
    {
      id: "pt",
      prompt: "What share of workers here took public transport to work?",
      real: ptShare(v),
      gm: ptShare(gm),
      detail: `${fmt(v.twPt)} of ${fmt(workers(v))} workers.`,
    },
  ];
}

export function scoreGuess(guess: number, real: number, streak: number): { hit: boolean; offPts: number; streak: number } {
  const offPts = Math.round(Math.abs(guess - real) * 100);
  const hit = Math.abs(guess - real) <= QUIZ_TOLERANCE + 1e-9;
  return { hit, offPts, streak: hit ? streak + 1 : 0 };
}
