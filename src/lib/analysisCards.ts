import { SITE_ANALYSIS_KINDS, type ActiveAnalyses, type SiteAnalysisKind } from "./sidebarSections";

export type AnalysisCardFocus = { seen: ActiveAnalyses; open: SiteAnalysisKind | null };

export function analysisCardsOn(tab: string, analyses: ActiveAnalyses): ActiveAnalyses {
  const shown = tab !== "satellite";
  return { solar: shown && analyses.solar, wind: shown && analyses.wind, view: shown && analyses.view };
}

export function anyAnalysisCardOn(tab: string, analyses: ActiveAnalyses): boolean {
  const cards = analysisCardsOn(tab, analyses);
  return SITE_ANALYSIS_KINDS.some((kind) => cards[kind]);
}

export function initialAnalysisCardFocus(analyses: ActiveAnalyses): AnalysisCardFocus {
  return { seen: analyses, open: [...SITE_ANALYSIS_KINDS].reverse().find((kind) => analyses[kind]) ?? null };
}

export function nextAnalysisCardFocus(focus: AnalysisCardFocus, analyses: ActiveAnalyses): AnalysisCardFocus {
  if (focus.seen === analyses) return focus;
  const turnedOn = [...SITE_ANALYSIS_KINDS].reverse().find((kind) => analyses[kind] && !focus.seen[kind]);
  if (turnedOn) return { seen: analyses, open: turnedOn };
  if (focus.open && !analyses[focus.open]) {
    return { seen: analyses, open: SITE_ANALYSIS_KINDS.find((kind) => analyses[kind]) ?? null };
  }
  return { seen: analyses, open: focus.open };
}

export function toggleAnalysisCard(focus: AnalysisCardFocus, kind: SiteAnalysisKind): AnalysisCardFocus {
  return { seen: focus.seen, open: focus.open === kind ? null : kind };
}

export function analysisCardCollapsed(open: SiteAnalysisKind | null, kind: SiteAnalysisKind): boolean {
  return open !== kind;
}

export function analysisStackTight(tab: string, analyses: ActiveAnalyses): boolean {
  const cards = analysisCardsOn(tab, analyses);
  return SITE_ANALYSIS_KINDS.filter((kind) => cards[kind]).length > 1;
}
