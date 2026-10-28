import { useEffect, useLayoutEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapAttribution } from "./MapAttribution";
import { MgaGridLayer } from "./MgaGridLayer";
import { applyBasemapStyleToMap, loadBasemapStyle } from "../lib/loadMapStyle";
import { M_PER_DEG_LAT, mPerDegLon, squareBBox } from "../lib/geo";
import { cutFrameLabelKm } from "../lib/placeLabel";
import { mgaZone } from "../lib/crsZone";
import { siteFrameAreaM2, type SiteFrameShape } from "../lib/siteFrame";
import { updateMapSiteLayers, removeMapSiteLayers } from "../lib/mapSiteLayers";
import { fetchOvertureBuildingsForCut } from "../lib/overtureBuildings";
import { fetchSiteParcelCached, siteBuildingIdsForPreview } from "../lib/sitePreviewCache";
import { FLAT_NORTH_UP_MAP_OPTIONS, applyFlatNorthUpMapHandlers } from "../lib/mapStageMapOptions";
import { initialLandingZoom } from "../lib/frameFit";
import type { Basemap, LonLat, ViewState } from "../types";

export type FlyRequest = {
  token: number;
  lon: number;
  lat: number;
  zoom?: number;
  bounds: [number, number, number, number] | null;
};

type Frame = { left: number; top: number; width: number; height: number };

export type MapSiteSearch = LonLat & { label: string };

export function MapStage({
  basemap,
  fitFrameOnLoad = false,
  sideM,
  frameShape,
  initialView,
  fly,
  loading,
  siteSearch,
  onCancel,
  onView,
  onFlyLanded,
}: {
  basemap: Basemap;
  /** Fit the whole cut frame into the map when it is first created (phones). */
  fitFrameOnLoad?: boolean;
  sideM: number;
  frameShape: SiteFrameShape;
  initialView: ViewState;
  fly: FlyRequest | null;
  loading: boolean;
  /** Geocoded address to highlight before the model is built. */
  siteSearch: MapSiteSearch | null;
  onCancel: () => void;
  onView: (view: ViewState) => void;
  /** The search or home camera animation has stopped. */
  onFlyLanded: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const sideRef = useRef(sideM);
  const frameShapeRef = useRef(frameShape);
  const onViewRef = useRef(onView);
  const onFlyLandedRef = useRef(onFlyLanded);
  const appliedBasemap = useRef<Basemap>(basemap);
  const mountedFly = useRef(fly?.token ?? null);

  // Direct DOM refs for 60 fps zero-re-render frame tracking during pan/zoom
  const frameRef = useRef<Frame | null>(null);
  const frameVisibleRef = useRef(false);
  const [frameVisible, setFrameVisible] = useState(false);
  const frameBoxRef = useRef<HTMLDivElement>(null);
  const frameLabelRef = useRef<HTMLDivElement>(null);
  const frameCadRef = useRef<HTMLDivElement>(null);
  const syncFrameRef = useRef<(() => void) | null>(null);
  const viewRafRef = useRef<number | null>(null);
  const pendingViewRef = useRef<ViewState | null>(null);
  const activeLonRef = useRef(initialView.lon);

  const [ready, setReady] = useState(false);
  const [loadingPct, setLoadingPct] = useState(0);
  const lastRoundedRef = useRef(0);
  const loadingPillRef = useRef<HTMLDivElement>(null);
  const loadingFillRef = useRef<HTMLDivElement>(null);
  const loadingPctTextRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!loading) {
      lastRoundedRef.current = 0;
      setLoadingPct(0);
      return;
    }
    const isDomTest =
      typeof navigator !== "undefined" && /jsdom|HappyDOM/i.test(navigator.userAgent ?? "");
    if (isDomTest) {
      lastRoundedRef.current = 18;
      setLoadingPct(18);
      return;
    }
    lastRoundedRef.current = 0;
    setLoadingPct(0);
    let floatPct = 0;
    let lastRounded = 0;
    let rafId = 0;
    let cancelled = false;
    const startMs = performance.now();
    let lastFrameMs = startMs;
    let modelMountedSinceMs: number | null = null;
    let webglReadySinceMs: number | null = null;
    let hold100Frames = 0;
    if (typeof window !== "undefined") {
      window.__citycutProgressSamples = [0];
    }
    if (loadingPillRef.current) loadingPillRef.current.dataset.progressPct = "0";
    if (loadingFillRef.current) loadingFillRef.current.style.width = "0%";
    if (loadingPctTextRef.current) loadingPctTextRef.current.textContent = "0%";

    const tick = (now: number) => {
      if (cancelled) return;
      const dtMs = Math.min(48, Math.max(12, now - lastFrameMs));
      lastFrameMs = now;
      const totalElapsed = now - startMs;
      const minBeat2Ms = Math.max(
        1150,
        (typeof window !== "undefined" && window.__citycutMinBeat2Ms) || 1200,
      );
      const modelMounted =
        typeof window !== "undefined" && Boolean(window.__citycutModelPrewarmMounted);
      if (modelMounted && modelMountedSinceMs === null) {
        modelMountedSinceMs = now;
      }
      const postMountElapsed = modelMountedSinceMs !== null ? now - modelMountedSinceMs : 0;
      const webglReady =
        typeof window !== "undefined" &&
        (Boolean(window.__citycutWebglPrewarmReady) || postMountElapsed > 8000);
      if (webglReady && webglReadySinceMs === null) {
        webglReadySinceMs = now;
      }

      if (lastRounded < 100) {
        const rawLoadProgress =
          typeof window !== "undefined" && typeof window.__citycutLoadProgress === "number"
            ? window.__citycutLoadProgress * 100
            : 0;
        let step = 0;
        if (!modelMounted) {
          const targetPct = Math.min(78, Math.max(rawLoadProgress, Math.min(64, totalElapsed * 0.032)));
          const gap = Math.max(0, targetPct - floatPct);
          const creep = floatPct < 74 ? dtMs * 0.012 : dtMs * 0.004;
          step = Math.min(3.4, Math.max(creep, gap * Math.min(0.28, dtMs * 0.014)));
          floatPct = Math.min(78, floatPct + step);
        } else if (!webglReady) {
          const targetPct = Math.min(90, Math.max(rawLoadProgress, 84));
          const gap = Math.max(0, targetPct - floatPct);
          const creep = floatPct < 89 ? dtMs * 0.018 : dtMs * 0.005;
          step = Math.min(3.2, Math.max(creep, gap * Math.min(0.32, dtMs * 0.016)));
          floatPct = Math.min(90, floatPct + step);
        } else {
          const postWebglElapsed = webglReadySinceMs !== null ? now - webglReadySinceMs : 0;
          const remainingTimeMs = Math.max(
            200,
            minBeat2Ms - totalElapsed,
            300 - postWebglElapsed,
          );
          const remainingPct = 100 - floatPct;
          const desiredStep = (remainingPct / remainingTimeMs) * dtMs;
          step = Math.min(4.8, Math.max(1.4, desiredStep));
          floatPct = Math.min(100, floatPct + step);
        }
        const rounded = Math.min(100, Math.max(lastRounded, Math.round(floatPct)));
        if (rounded !== lastRounded) {
          lastRounded = rounded;
          lastRoundedRef.current = rounded;
          if (loadingPillRef.current) {
            loadingPillRef.current.dataset.progressPct = String(rounded);
          }
          if (loadingFillRef.current) {
            loadingFillRef.current.style.width = `${rounded}%`;
          }
          if (loadingPctTextRef.current) {
            loadingPctTextRef.current.textContent = `${rounded}%`;
          }
          if (typeof window !== "undefined") {
            const samples = window.__citycutProgressSamples ?? [0];
            if (samples[samples.length - 1] !== rounded) {
              samples.push(rounded);
            }
            window.__citycutProgressSamples = samples;
          }
        }
      }

      if (lastRounded >= 100) {
        if (typeof window !== "undefined") {
          const samples = window.__citycutProgressSamples ?? [0];
          if (samples[samples.length - 1] !== 100) {
            samples.push(100);
          }
          window.__citycutProgressSamples = samples;
          hold100Frames += 1;
          if (hold100Frames < 2) {
            rafId = window.requestAnimationFrame(tick);
            return;
          }
          if (!window.__citycutIntroStarted && !window.__citycutIntroReadyToFire) {
            window.__citycutIntroReadyToFire = true;
            window.setTimeout(() => {
              if (!window.__citycutIntroStarted) {
                window.__citycutIntroStarted = true;
                window.__citycutIntroStartMs = performance.now();
                window.dispatchEvent(new CustomEvent("citycut:intro-start"));
              }
            }, 1500);
          }
        }
        return;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [loading]);
  const [mapEpoch, setMapEpoch] = useState(0);
  const [basemapStyleFailed, setBasemapStyleFailed] = useState(false);
  const [sitePreviewFailed, setSitePreviewFailed] = useState(false);
  sideRef.current = sideM;
  frameShapeRef.current = frameShape;
  onViewRef.current = onView;
  onFlyLandedRef.current = onFlyLanded;

  const applyFrameStyles = (next: Frame) => {
    const box = frameBoxRef.current;
    if (box) {
      box.style.left = `${next.left}px`;
      box.style.top = `${next.top}px`;
      box.style.width = `${next.width}px`;
      box.style.height = `${next.height}px`;
    }
    const clientW = containerRef.current?.clientWidth || 800;
    const clientH = containerRef.current?.clientHeight || 900;
    if (typeof window !== "undefined" && clientH > 0 && next.height > 0) {
      (window as Window & { __citycutFrameRatio?: number }).__citycutFrameRatio = Math.min(
        0.75,
        Math.max(0.25, next.height / clientH),
      );
    }
    const labelLeft = Math.min(Math.max(next.left + next.width / 2, 88), clientW - 150);
    const labelEl = frameLabelRef.current;
    if (labelEl) {
      labelEl.style.left = `${labelLeft}px`;
      labelEl.style.top = `${Math.max(next.top, 16)}px`;
    }
    const cadEl = frameCadRef.current;
    if (cadEl) {
      cadEl.style.left = `${labelLeft}px`;
      cadEl.style.top = `${next.top + next.height + 14}px`;
    }
  };

  useLayoutEffect(() => {
    if (frameVisible && frameRef.current) {
      applyFrameStyles(frameRef.current);
    }
  }, [frameVisible, sideM, frameShape]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    let onLoad: (() => void) | null = null;
    let onMove: (() => void) | null = null;
    let onMoveEnd: (() => void) | null = null;
    let onResize: (() => void) | null = null;

    const flushPendingView = () => {
      if (viewRafRef.current != null) {
        window.cancelAnimationFrame(viewRafRef.current);
        viewRafRef.current = null;
      }
      if (pendingViewRef.current) {
        const view = pendingViewRef.current;
        pendingViewRef.current = null;
        onViewRef.current(view);
      }
    };

    void loadBasemapStyle(appliedBasemap.current).then(({ style, styleLoadFailed }) => {
      if (cancelled) return;
      if (styleLoadFailed) setBasemapStyleFailed(true);
      map = new maplibregl.Map({
        container,
        style: typeof style === "string" ? undefined : style,
        center: [initialView.lon, initialView.lat],
        // On a phone, at load only, zoom out so the whole cut frame fits the map.
        zoom: initialLandingZoom({
          zoom: initialView.zoom,
          sideM: sideRef.current,
          lat: initialView.lat,
          widthPx: container.clientWidth,
          heightPx: container.clientHeight,
          fit: fitFrameOnLoad,
        }),
        attributionControl: false,
        ...FLAT_NORTH_UP_MAP_OPTIONS,
      });
      if (typeof style === "string") applyBasemapStyleToMap(map, style);
      applyFlatNorthUpMapHandlers(map);
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;

      const syncFrameDom = () => {
        if (!map) return null;
        const center = map.getCenter();
        activeLonRef.current = center.lng;
        const half = sideRef.current / 2;
        const dLat = half / M_PER_DEG_LAT;
        const dLon = half / mPerDegLon(center.lat);
        const northWest = map.project([center.lng - dLon, center.lat + dLat]);
        const southEast = map.project([center.lng + dLon, center.lat - dLat]);
        const next: Frame = {
          left: Math.min(northWest.x, southEast.x),
          top: Math.min(northWest.y, southEast.y),
          width: Math.abs(southEast.x - northWest.x),
          height: Math.abs(southEast.y - northWest.y),
        };
        frameRef.current = next;
        applyFrameStyles(next);
        const shouldShow = next.width > 8;
        if (shouldShow !== frameVisibleRef.current) {
          frameVisibleRef.current = shouldShow;
          setFrameVisible(shouldShow);
        }
        return { lon: center.lng, lat: center.lat, zoom: map.getZoom() };
      };
      syncFrameRef.current = () => {
        syncFrameDom();
      };

      onMove = () => {
        const nextView = syncFrameDom();
        if (!nextView) return;
        pendingViewRef.current = nextView;
        if (viewRafRef.current == null) {
          viewRafRef.current = window.requestAnimationFrame(() => {
            viewRafRef.current = null;
            if (pendingViewRef.current) {
              const v = pendingViewRef.current;
              pendingViewRef.current = null;
              onViewRef.current(v);
            }
          });
        }
      };

      onResize = () => {
        const nextView = syncFrameDom();
        if (nextView) {
          pendingViewRef.current = null;
          onViewRef.current(nextView);
        }
      };

      onLoad = () => {
        setReady(true);
        const nextView = syncFrameDom();
        if (nextView) {
          pendingViewRef.current = null;
          onViewRef.current(nextView);
        }
      };

      onMoveEnd = () => {
        const nextView = syncFrameDom();
        if (nextView) {
          pendingViewRef.current = nextView;
        }
        flushPendingView();
        setMapEpoch((value) => value + 1);
      };

      map.on("load", onLoad);
      map.on("move", onMove);
      map.on("moveend", onMoveEnd);
      map.on("resize", onResize);
    });

    return () => {
      cancelled = true;
      if (viewRafRef.current != null) {
        window.cancelAnimationFrame(viewRafRef.current);
        viewRafRef.current = null;
      }
      syncFrameRef.current = null;
      const active = map ?? mapRef.current;
      if (active && onLoad && onMove && onMoveEnd && onResize) {
        active.off("load", onLoad);
        active.off("move", onMove);
        active.off("moveend", onMoveEnd);
        active.off("resize", onResize);
        removeMapSiteLayers(active);
        active.remove();
      }
      mapRef.current = null;
      setReady(false);
    };
    // The map is created once per mount. Later camera changes go through flyTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sideRef.current = sideM;
    frameShapeRef.current = frameShape;
    const map = mapRef.current;
    if (!map || !ready) return;
    syncFrameRef.current?.();
    map.fire("move");
  }, [sideM, frameShape, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (appliedBasemap.current === basemap) return;
    appliedBasemap.current = basemap;
    void loadBasemapStyle(basemap).then(({ style, styleLoadFailed }) => {
      if (mapRef.current !== map) return;
      if (styleLoadFailed) setBasemapStyleFailed(true);
      else setBasemapStyleFailed(false);
      applyBasemapStyleToMap(map, style);
      map.once("style.load", () => {
        setMapEpoch((value) => value + 1);
      });
    });
  }, [basemap, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !siteSearch) {
      const mapOff = mapRef.current;
      if (mapOff?.loaded()) removeMapSiteLayers(mapOff);
      return;
    }
    let cancelled = false;
    setSitePreviewFailed(false);
    const center = map.getCenter();
    const cutCenter: LonLat = { lat: center.lat, lon: center.lng };
    const controller = new AbortController();

    void (async () => {
      try {
        const bounds = squareBBox(cutCenter, sideM);
        const [buildingResult, parcel] = await Promise.all([
          fetchOvertureBuildingsForCut(bounds, cutCenter, sideM, controller.signal),
          fetchSiteParcelCached(siteSearch, cutCenter, sideM, { signal: controller.signal }),
        ]);
        if (cancelled || controller.signal.aborted) return;
        const siteBuildingIds = siteBuildingIdsForPreview(
          buildingResult.buildings,
          siteSearch,
          cutCenter,
          parcel,
        );
        if (!map.loaded()) await new Promise<void>((resolve) => map.once("idle", () => resolve()));
        if (cancelled) return;
        updateMapSiteLayers(map, {
          center: cutCenter,
          buildings: buildingResult.buildings,
          siteBuildingIds,
          parcel,
        });
      } catch {
        if (!cancelled && !controller.signal.aborted) setSitePreviewFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (map.loaded()) removeMapSiteLayers(map);
    };
  }, [ready, sideM, mapEpoch, siteSearch?.lat, siteSearch?.lon, siteSearch?.label]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fly || !ready) return;
    if (fly.token === mountedFly.current) return;
    mountedFly.current = fly.token;
    let landed = false;
    const finish = () => {
      if (landed) return;
      landed = true;
      map.off("moveend", finish);
      onFlyLandedRef.current();
    };
    map.on("moveend", finish);
    if (fly.bounds) {
      map.fitBounds(
        [
          [fly.bounds[0], fly.bounds[1]],
          [fly.bounds[2], fly.bounds[3]],
        ],
        { padding: 56, maxZoom: 16, duration: 1100, pitch: 0, bearing: 0 },
      );
    } else {
      map.flyTo({
        center: [fly.lon, fly.lat],
        zoom: fly.zoom ?? Math.max(map.getZoom(), 15),
        duration: 1100,
        pitch: 0,
        bearing: 0,
      });
    }
    const frame = window.requestAnimationFrame(() => {
      if (!map.isMoving()) finish();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      map.off("moveend", finish);
    };
  }, [fly, ready]);

  // The landing map fills the whole window under the floating controls (perimeter HUD on desktop,
  // bottom sheet on a phone) and is NOT padded for them: the cut frame sits on the middle of
  // the window (Kelvin, PR 112). Only load and a search pick the centre; toggles never move it.

  const sideKm = sideM / 1000;
  const label = cutFrameLabelKm(sideKm, frameShape);
  const circleFrame = frameShape === "circle";
  const roundedM = Math.round(sideM).toLocaleString();
  const dimMeters = circleFrame ? `⌀ ${roundedM} m` : `${roundedM} × ${roundedM} m`;
  const areaKm2 = (siteFrameAreaM2(sideM, frameShape) / 1_000_000).toFixed(2);
  const zone = mgaZone(activeLonRef.current);
  const cadReadout = `${dimMeters} | ${areaKm2} km² · MGA${zone}`;
  const currentFrame = frameRef.current;
  const clientW = containerRef.current?.clientWidth ?? 800;
  const initialLabelLeft = currentFrame
    ? Math.min(Math.max(currentFrame.left + currentFrame.width / 2, 88), clientW - 150)
    : 400;

  return (
    <div className={loading ? "map-wrap is-loading" : "map-wrap"}>
      <div ref={containerRef} className={basemap === "satellite" ? "map-canvas" : "map-canvas map-canvas-muted"} />
      {basemap !== "satellite" && <div className="map-tint" aria-hidden="true" />}
      {ready && <MgaGridLayer map={mapRef.current} epoch={mapEpoch} />}
      <MapAttribution basemap={basemap} />
      {frameVisible && currentFrame && (
        <>
          <div
            ref={frameBoxRef}
            className={circleFrame ? "frame frame-circle" : "frame"}
            data-shape={frameShape}
            style={{
              left: currentFrame.left,
              top: currentFrame.top,
              width: currentFrame.width,
              height: currentFrame.height,
            }}
          >
            {!circleFrame && (
              <>
                <span className="frame-handle frame-handle-nw is-tl" aria-hidden="true" />
                <span className="frame-handle frame-handle-ne is-tr" aria-hidden="true" />
                <span className="frame-handle frame-handle-sw is-bl" aria-hidden="true" />
                <span className="frame-handle frame-handle-se is-br" aria-hidden="true" />
              </>
            )}
          </div>
          <div
            ref={frameLabelRef}
            className="frame-label"
            style={{
              left: initialLabelLeft,
              top: Math.max(currentFrame.top, 16),
            }}
          >
            {label}
          </div>
          <div
            ref={frameCadRef}
            className="frame-cad-tag"
            style={{
              left: initialLabelLeft,
              top: currentFrame.top + currentFrame.height + 14,
            }}
          >
            {cadReadout}
          </div>
        </>
      )}
      {!loading && (basemapStyleFailed || sitePreviewFailed) && (
        <div className="map-stage-notices">
          {basemapStyleFailed && (
            <p className="map-stage-notice" role="status">
              Basemap style failed to load.
            </p>
          )}
          {sitePreviewFailed && (
            <p className="map-stage-notice" role="status">
              Site preview on the map could not be loaded.
            </p>
          )}
        </div>
      )}
      {loading && <div className="loading-shield" />}
      {loading && (
        <div
          ref={loadingPillRef}
          className="loading-card loading-hud-pill hud-card"
          role="status"
          data-progress-pct={lastRoundedRef.current || loadingPct}
        >
          <div className="loading-hud-row">
            <span className="loading-pulse-dot" aria-hidden="true" />
            <strong>Building 3D site cut · LiDAR + Vicmap…</strong>
            <div className="loading-prog-track" aria-hidden="true">
              <div
                ref={loadingFillRef}
                className="loading-prog-fill"
                style={{ width: `${lastRoundedRef.current || loadingPct}%` }}
              />
            </div>
            <span ref={loadingPctTextRef} className="loading-prog-pct" aria-hidden="true">
              {lastRoundedRef.current || loadingPct}%
            </span>
          </div>
          <p>
            Fetching DEM terrain, Overture massings, roads and 1m contours for this block.
          </p>
          <div className="bar" aria-hidden="true">
            <span />
          </div>
          <button className="text-btn" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
