import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WalkRippleAmenityBeaconLayer } from "../lib/walkRippleAmenityBeaconLayer";
import { fetchWalkRippleAmenities } from "../lib/walkRippleAmenityOsm";
import { assignAmenityArrivals, countAmenitiesReached, type AmenityArrival } from "../lib/walkRippleAmenityReach";
import {
  defaultAmenityTypeFilters,
  WALK_RIPPLE_AMENITY_TYPES,
  type WalkRippleAmenity,
  type WalkRippleAmenityType,
} from "../lib/walkRippleAmenityTypes";
import { WalkRippleBuildingTint } from "../lib/walkRippleBuildingTint";
import { WalkRippleLayer, walkRippleModeLabel } from "../lib/walkRippleLayer";
import {
  assignBuildingArrivals,
  buildWalkNetwork,
  computeRippleTimes,
  WALK_RIPPLE_TIMELINE_MAX_MIN,
  type RippleTimes,
} from "../lib/walkRippleNetwork";
import { qaModeFromSearch } from "../lib/qaCameraBridge";
import { groundHeightAt } from "../lib/viewshed";
import type { CityModel } from "../types";

const AMENITY_BEACON_PICK_HEIGHT_M = 12;

export type WalkRippleStatus = "idle" | "placing" | "ready" | "animating";

const ANIM_REAL_MS = 5200;

export type WalkRippleAmenityPick = {
  amenity: AmenityArrival;
  clientX: number;
  clientY: number;
};

export type WalkRipple = {
  layer: WalkRippleLayer;
  tint: WalkRippleBuildingTint;
  amenityBeacons: WalkRippleAmenityBeaconLayer;
  placing: boolean;
  setPlacing: (on: boolean) => void;
  placePoint: (east: number, north: number) => void;
  clear: () => void;
  status: WalkRippleStatus;
  modeLabel: string | null;
  times: RippleTimes | null;
  arrivalCount: number;
  buildingArrivals: Map<number, number> | null;
  rippleMinutes: number;
  setRippleMinutes: (minutes: number) => void;
  ripplePlaying: boolean;
  toggleRipplePlay: () => void;
  amenities: WalkRippleAmenity[];
  amenitiesLoading: boolean;
  amenitiesUnavailable: boolean;
  amenityArrivals: AmenityArrival[];
  amenityCounts: Record<WalkRippleAmenityType, number>;
  amenityFilters: Record<WalkRippleAmenityType, boolean>;
  setAmenityFilter: (type: WalkRippleAmenityType, on: boolean) => void;
  selectedAmenity: WalkRippleAmenityPick | null;
  setSelectedAmenity: (pick: WalkRippleAmenityPick | null) => void;
};

export function useWalkRipple(model: CityModel, analysisModel: Pick<CityModel, "buildings" | "roads" | "terrain" | "sideM">): WalkRipple {
  const layer = useMemo(() => new WalkRippleLayer(model), [model]);
  const tint = useMemo(() => new WalkRippleBuildingTint(), []);
  const amenityBeacons = useMemo(() => new WalkRippleAmenityBeaconLayer(model), [model]);
  useEffect(() => () => {
    layer.dispose();
    amenityBeacons.dispose();
  }, [layer, amenityBeacons]);

  const [placing, setPlacing] = useState(false);
  const [status, setStatus] = useState<WalkRippleStatus>("idle");
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const [times, setTimes] = useState<RippleTimes | null>(null);
  const [arrivalCount, setArrivalCount] = useState(0);
  const [buildingArrivals, setBuildingArrivals] = useState<Map<number, number> | null>(null);
  const [rippleMinutes, setRippleMinutesState] = useState(0);
  const [ripplePlaying, setRipplePlaying] = useState(false);
  const [amenities, setAmenities] = useState<WalkRippleAmenity[]>([]);
  const [amenitiesLoading, setAmenitiesLoading] = useState(true);
  const [amenitiesUnavailable, setAmenitiesUnavailable] = useState(false);
  const [amenityArrivals, setAmenityArrivals] = useState<AmenityArrival[]>([]);
  const [amenityFilters, setAmenityFilters] = useState(defaultAmenityTypeFilters);
  const [selectedAmenity, setSelectedAmenity] = useState<WalkRippleAmenityPick | null>(null);
  const rafRef = useRef<number | null>(null);
  const networkRef = useRef(buildWalkNetwork(model.roads));
  const buildingArrivalsRef = useRef<Map<number, number> | null>(null);
  const amenitiesRef = useRef<WalkRippleAmenity[]>([]);
  const amenityArrivalsRef = useRef<AmenityArrival[]>([]);
  const rippleMinutesRef = useRef(0);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    buildingArrivalsRef.current = buildingArrivals;
  }, [buildingArrivals]);

  useEffect(() => {
    amenitiesRef.current = amenities;
  }, [amenities]);

  useEffect(() => {
    amenityArrivalsRef.current = amenityArrivals;
  }, [amenityArrivals]);

  useEffect(() => {
    rippleMinutesRef.current = rippleMinutes;
  }, [rippleMinutes]);

  useEffect(() => {
    const gen = ++fetchGenRef.current;
    setAmenities([]);
    setAmenitiesLoading(true);
    setAmenitiesUnavailable(false);
    setAmenityArrivals([]);
    amenityBeacons.clear();
    void fetchWalkRippleAmenities(model).then((result) => {
      if (gen !== fetchGenRef.current) return;
      setAmenitiesLoading(false);
      if (result.status === "unavailable") {
        setAmenitiesUnavailable(true);
        return;
      }
      setAmenities(result.amenities);
    });
  }, [model.center.lat, model.center.lon, model.sideM, model.frameShape]);

  useEffect(() => {
    networkRef.current = buildWalkNetwork(model.roads);
    setPlacing(false);
    setStatus("idle");
    setModeLabel(null);
    setTimes(null);
    setArrivalCount(0);
    setBuildingArrivals(null);
    setAmenityArrivals([]);
    amenityBeacons.clear();
    setRippleMinutesState(0);
    setRipplePlaying(false);
    setSelectedAmenity(null);
    layer.clear();
    tint.detach();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, [model, layer, tint, amenityBeacons]);

  useEffect(() => {
    for (const type of WALK_RIPPLE_AMENITY_TYPES) {
      amenityBeacons.setTypeVisible(type, amenityFilters[type]);
    }
  }, [amenityBeacons, amenityFilters]);

  const amenityCounts = useMemo(
    () => countAmenitiesReached(amenityArrivals, rippleMinutes, amenityFilters),
    [amenityArrivals, rippleMinutes, amenityFilters],
  );

  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setRipplePlaying(false);
  }, []);

  const applyRippleMinutes = useCallback(
    (minutes: number, opts?: { keepPlaying?: boolean }) => {
      const clamped = Math.max(0, Math.min(WALK_RIPPLE_TIMELINE_MAX_MIN, minutes));
      layer.setRippleTimeMinutes(clamped);
      tint.setRippleTimeMinutes(clamped);
      amenityBeacons.setRippleTimeMinutes(clamped);
      setRippleMinutesState(clamped);
      if (times) {
        setStatus(clamped >= WALK_RIPPLE_TIMELINE_MAX_MIN - 0.01 ? "ready" : "animating");
      }
      if (!opts?.keepPlaying) stopAnim();
    },
    [amenityBeacons, layer, stopAnim, times, tint],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !qaModeFromSearch(window.location.search)) return;
    window.__citycutWalkRippleQa = {
      setMinutes: (minutes: number) => {
        applyRippleMinutes(minutes);
      },
      getMinutes: () => rippleMinutes,
      getUniformMinutes: () => layer.uniforms.uRippleTime.value,
      countReachedBuildings: (minuteCutoff: number) => {
        const map = buildingArrivalsRef.current;
        if (!map) return 0;
        let n = 0;
        for (const arrival of map.values()) {
          if (arrival <= minuteCutoff + 0.04) n += 1;
        }
        return n;
      },
      getAmenityCounts: () => amenityCounts,
      getAmenityPoolCount: () => amenitiesRef.current.length,
      amenitiesUnavailable: () => amenitiesUnavailable,
      screenPointForFirstReachedAmenity: () => {
        const minute = rippleMinutesRef.current;
        const reached = amenityArrivalsRef.current
          .filter((a) => a.arrivalMin <= minute + 0.04)
          .sort((a, b) => a.arrivalMin - b.arrivalMin);
        const project = window.__citycutQa?.projectToScreen;
        if (!project) return null;
        const canvas =
          document.querySelector(".scene-canvas canvas") ?? document.querySelector("canvas.scene-canvas");
        const rect = canvas?.getBoundingClientRect();
        const bottomHudInsetPx = 150;
        for (const amenity of reached) {
          const ground = groundHeightAt(analysisModel, amenity.east, amenity.north);
          const point = project({
            x: amenity.east,
            y: ground + AMENITY_BEACON_PICK_HEIGHT_M,
            z: -amenity.north,
          });
          if (!point || !rect) return point;
          if (point.x < rect.left + 8 || point.x > rect.right - 8) continue;
          if (point.y < rect.top + 8 || point.y > rect.bottom - bottomHudInsetPx) continue;
          return point;
        }
        return null;
      },
    };
    return () => {
      delete window.__citycutWalkRippleQa;
    };
  }, [analysisModel, applyRippleMinutes, layer, rippleMinutes, amenityCounts, amenitiesUnavailable]);

  const startAnim = useCallback(() => {
    stopAnim();
    setRipplePlaying(true);
    setStatus("animating");
    const t0 = performance.now();
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / ANIM_REAL_MS);
      const minutes = u * WALK_RIPPLE_TIMELINE_MAX_MIN;
      layer.setRippleTimeMinutes(minutes);
      tint.setRippleTimeMinutes(minutes);
      amenityBeacons.setRippleTimeMinutes(minutes);
      setRippleMinutesState(minutes);
      if (u < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        setStatus("ready");
        setRipplePlaying(false);
        rafRef.current = null;
      }
    };
    layer.setRippleTimeMinutes(0);
    tint.setRippleTimeMinutes(0);
    amenityBeacons.setRippleTimeMinutes(0);
    setRippleMinutesState(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [amenityBeacons, layer, stopAnim, tint]);

  const toggleRipplePlay = useCallback(() => {
    if (!times) return;
    if (ripplePlaying) {
      stopAnim();
      return;
    }
    startAnim();
  }, [ripplePlaying, startAnim, stopAnim, times]);

  const syncAmenityBeacons = useCallback(
    (computed: RippleTimes) => {
      const list = amenitiesRef.current;
      if (list.length === 0) {
        setAmenityArrivals([]);
        amenityBeacons.clear();
        return;
      }
      const arrivals = assignAmenityArrivals(list, computed, analysisModel);
      setAmenityArrivals(arrivals);
      amenityBeacons.setArrivals(arrivals);
    },
    [analysisModel, amenityBeacons],
  );

  useEffect(() => {
    if (!times || amenities.length === 0) return;
    syncAmenityBeacons(times);
  }, [amenities, times, syncAmenityBeacons]);

  const runAnalysis = useCallback(
    (east: number, north: number) => {
      stopAnim();
      setSelectedAmenity(null);
      const computed = computeRippleTimes(analysisModel, east, north);
      const network = computed.mode === "network" ? buildWalkNetwork(analysisModel.roads) : null;
      const arrivals = assignBuildingArrivals(analysisModel, computed);
      layer.applyResult(computed, network);
      syncAmenityBeacons(computed);
      setTimes(computed);
      setModeLabel(walkRippleModeLabel(computed));
      setArrivalCount(arrivals.size);
      setBuildingArrivals(new Map(arrivals));
      setPlacing(false);
      setStatus("animating");
      return { computed, arrivals };
    },
    [analysisModel, layer, stopAnim, syncAmenityBeacons],
  );

  const placePoint = useCallback(
    (east: number, north: number) => {
      runAnalysis(east, north);
      startAnim();
    },
    [runAnalysis, startAnim],
  );

  const clear = useCallback(() => {
    stopAnim();
    layer.clear();
    tint.detach();
    amenityBeacons.clear();
    setTimes(null);
    setModeLabel(null);
    setArrivalCount(0);
    setBuildingArrivals(null);
    setAmenityArrivals([]);
    setRippleMinutesState(0);
    setStatus("idle");
    setPlacing(false);
    setSelectedAmenity(null);
  }, [amenityBeacons, layer, stopAnim, tint]);

  const setAmenityFilter = useCallback((type: WalkRippleAmenityType, on: boolean) => {
    setAmenityFilters((prev) => ({ ...prev, [type]: on }));
  }, []);

  return {
    layer,
    tint,
    amenityBeacons,
    placing,
    setPlacing: (on: boolean) => {
      setPlacing(on);
      setStatus(on ? "placing" : status === "placing" ? "idle" : status);
    },
    placePoint,
    clear,
    status,
    modeLabel,
    times,
    arrivalCount,
    buildingArrivals,
    rippleMinutes,
    setRippleMinutes: (minutes: number) => applyRippleMinutes(minutes),
    ripplePlaying,
    toggleRipplePlay,
    amenities,
    amenitiesLoading,
    amenitiesUnavailable,
    amenityArrivals,
    amenityCounts,
    amenityFilters,
    setAmenityFilter,
    selectedAmenity,
    setSelectedAmenity,
  };
}
