import { useReducer, useState } from "react";
import { arrowToolReducer, initialArrowToolState } from "../../lib/diagramArrowsTool";
import {
  analysisCardsOn,
  initialAnalysisCardFocus,
  nextAnalysisCardFocus,
  toggleAnalysisCard,
} from "../../lib/analysisCards";
import { resolveSunDomeRadiusM, sunDomeRange } from "../../lib/heliodonRadius";
import { NO_ANALYSES, analysesOf, type ActiveAnalyses, type SiteAnalysisKind } from "../../lib/sidebarSections";
import type { DesignWind } from "../../lib/windDesignWinds";
import { DEFAULT_WIND_SETTINGS, windPlanMapShown, type WindPlanViewId, type WindViewSettings } from "../../lib/windState";
import { findDesignWind } from "../../lib/windDesignWinds";
import { windMotionPaused } from "../../lib/windStreakMotion";
import type { SolarViewSettings } from "../SolarHeliodon";
import type { WalkViewshed } from "../useWalkViewshed";
import { DEFAULT_SUN_HOURS_WINDOW, sunHoursScaleMaxHours } from "../../lib/sunHoursWindow";
import { initialSolarSettings } from "./initialSolarSettings";
import { ModelPageViewportFooter } from "./ModelPageViewportFooter";
import { SolarStudyHudCard } from "./SolarStudyHudCard";
import { ViewshedHudCard } from "./ViewshedHudCard";
import { WindRoseHudCard } from "./WindRoseHudCard";
import type { ModelPageViewModel } from "./useModelPage";

const emptyStorage = { getItem: () => null, setItem: () => undefined };

export type AnalysisHudHarnessProps = {
  onSolar?: (next: SolarViewSettings) => void;
  onWind?: (next: WindViewSettings) => void;
  onWalk?: (call: string) => void;
  initialKinds?: readonly SiteAnalysisKind[];
  reducedMotion?: boolean;
  tab?: "3d" | "drawing" | "satellite";
  projection?: "perspective" | "plan";
  sideM?: number;
  cut?: { widthM: number; heightM: number };
  designWinds?: readonly DesignWind[];
  walk?: Partial<WalkViewshed>;
  sunHoursReady?: boolean;
  pickedBuildingIds?: readonly number[];
  initialPlanView?: WindPlanViewId;
};

export function AnalysisHudHarness({
  onSolar = () => undefined,
  onWind = () => undefined,
  onWalk = () => undefined,
  initialKinds = [],
  reducedMotion = false,
  tab = "3d",
  projection = "perspective",
  sideM = 500,
  cut,
  designWinds = [],
  walk: walkOverrides = {},
  sunHoursReady = false,
  pickedBuildingIds = [],
  initialPlanView = "map",
}: AnalysisHudHarnessProps) {
  const [solar, setSolar] = useState(() => initialSolarSettings("", emptyStorage));
  const [analyses, setAnalyses] = useState<ActiveAnalyses>(
    initialKinds.length ? analysesOf(...initialKinds) : NO_ANALYSES,
  );
  const [focus, setFocus] = useState(() => initialAnalysisCardFocus(analyses));
  if (focus.seen !== analyses) setFocus(nextAnalysisCardFocus(focus, analyses));
  const [windStreaksOn, setWindStreaksOn] = useState(false);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const paused = windMotionPaused({ systemReduced: reducedMotion, animateAnyway: false, userPaused });
  const [windSettings, setWindSettings] = useState<WindViewSettings>(DEFAULT_WIND_SETTINGS);
  const [renderQuality, setRenderQuality] = useState<"high" | "fast">("high");
  const [sunDomeSizeM, setSunDomeSizeM] = useState<number | null>(null);
  const [planMode, setPlanMode] = useState<"speed" | "comfort">("speed");
  const [vectorsOn, setVectorsOn] = useState(true);
  const [planView, setPlanView] = useState<WindPlanViewId>(initialPlanView);
  const [eyeM, setEyeM] = useState(1.6);
  const [radiusM, setRadiusM] = useState(200);
  const [speed, setSpeed] = useState(1);
  const [drawingPath, setDrawingPath] = useState(false);
  const [arrowState, dispatchArrows] = useReducer(arrowToolReducer, undefined, () => initialArrowToolState());
  const range = sunDomeRange({ sideM, widthM: cut?.widthM, heightM: cut?.heightM });
  const cards = analysisCardsOn(tab, analyses);
  const sunHoursStudy = {
    month: solar.month,
    day: solar.day,
    window: solar.sunHoursWindow ?? DEFAULT_SUN_HOURS_WINDOW,
  };
  const vm = {
    analyses,
    analysisCards: cards,
    analysisCardOpen: focus.open,
    toggleAnalysisCard: (kind: SiteAnalysisKind) => setFocus((current) => toggleAnalysisCard(current, kind)),
    diagramArrows: { state: arrowState, dispatch: dispatchArrows },
    commitRenderQuality: setRenderQuality,
    renderQuality,
    commitSolar: (next: SolarViewSettings) => {
      onSolar(next);
      setSolar(next);
    },
    commitWind: (next: WindViewSettings) => {
      onWind(next);
      setWindSettings(next);
    },
    consoleDaylight: { sunrise: 456, sunset: 1026 },
    consolePlaying: false,
    consoleSun: { altitudeDeg: 12, azimuthDeg: 300 },
    consoleWindStats: null,
    designWinds,
    designWind: findDesignWind(designWinds, windSettings.designWind),
    drawing: "site",
    model: { buildings: [] },
    setAnalyses,
    setWindStreaksOn,
    windStreaksOn,
    windStreams: [],
    windMotion: { paused, setPaused: setUserPaused, animateStreaks: !paused, streaksPaused: paused },
    setConsolePlaying: () => undefined,
    setSunStudySelected: () => undefined,
    setSunDomeSizeM,
    siteWind: null,
    solar,
    sunDome: { range, chosenM: sunDomeSizeM, radiusM: resolveSunDomeRadiusM(range, sunDomeSizeM) },
    sunHoursGround: sunHoursReady
      ? {
          grid: { maxSunHours: 9 },
          scaleMaxHours: sunHoursScaleMaxHours(sunHoursStudy.window, 9),
          resolution: null,
          targetResolution: null,
          pending: true,
          pendingSurfaces: false,
          progress: null,
          study: sunHoursStudy,
        }
      : { grid: null, pending: false, pendingSurfaces: false, progress: null, study: sunHoursStudy },
    sunHoursPickedIds: pickedBuildingIds,
    sunStudySelected: [],
    tab,
    walk: {
      eyeM,
      setEyeM,
      radiusM,
      setRadiusM,
      speed,
      setSpeed,
      drawing: drawingPath,
      setDrawing: setDrawingPath,
      clickCount: 0,
      sampleCount: 0,
      lengthM: 0,
      progress: 0,
      status: "empty",
      playing: false,
      setPlaying: () => onWalk("play"),
      compute: () => onWalk("compute"),
      clear: () => onWalk("clear"),
      seek: (index: number) => onWalk(`seek ${index}`),
      ...walkOverrides,
    },
    walkAt: { index: 0, distanceM: 0 },
    view: { projection },
    windSettings,
    windPlan: {
      active: windPlanMapShown({ tab, projection, windOn: analyses.wind, hasSiteWind: true, planView }),
      view: planView,
      setView: setPlanView,
      mode: planMode,
      setMode: setPlanMode,
      vectorsOn,
      setVectorsOn,
    },
  } as unknown as ModelPageViewModel;
  return (
    <>
      <div className="right-hud-stack">
        {cards.solar ? <SolarStudyHudCard vm={vm} /> : null}
        {cards.wind ? <WindRoseHudCard vm={vm} /> : null}
        {cards.view ? <ViewshedHudCard vm={vm} /> : null}
      </div>
      <ModelPageViewportFooter vm={vm} />
    </>
  );
}
