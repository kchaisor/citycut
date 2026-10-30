import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { prismMetricValue, formatPrismValue, ageShare } from "../lib/peopleMetrics";
import type { PeopleCityLayer } from "../lib/peopleCityLayer";
import { usePeople, type PeopleState, type PeopleStore } from "../lib/peopleStore";
import { AGE_BANDS } from "../lib/censusPeople";

const DRAG_SLOP_PX = 4;

const selectSelected = (s: PeopleState) => s.selected;
const selectCensus = (s: PeopleState) => s.census;
const selectMetric = (s: PeopleState) => s.city.metric;
const selectBand = (s: PeopleState) => s.city.band;
const selectLensShown = (s: PeopleState) => s.active && s.view === "lens" && s.lens !== null;
const selectLensPeople = (s: PeopleState) => s.lens?.people ?? 0;
const selectLensMinutes = (s: PeopleState) => s.minutes;
const selectLensEst = (s: PeopleState) => (s.lens?.estimated ?? false) || s.walk.status !== "live";

export function PeopleCityDriver({ layer, store }: { layer: PeopleCityLayer; store: PeopleStore }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const calloutRef = useRef<THREE.Group>(null);
  const badgeRef = useRef<THREE.Group>(null);
  const selected = usePeople(store, selectSelected);
  const census = usePeople(store, selectCensus);
  const metric = usePeople(store, selectMetric);
  const band = usePeople(store, selectBand);
  const lensShown = usePeople(store, selectLensShown);
  const lensPeople = usePeople(store, selectLensPeople);
  const lensEst = usePeople(store, selectLensEst);
  const lensMinutes = usePeople(store, selectLensMinutes);

  useFrame(() => {
    if (layer.update(performance.now())) invalidate();
    if (calloutRef.current && selected) {
      const top = layer.prismTop(selected);
      if (top) calloutRef.current.position.copy(top);
    }
    if (badgeRef.current) {
      const anchor = layer.lensAnchor();
      if (anchor) badgeRef.current.position.copy(anchor);
    }
  });

  useLayoutEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragging = false;
    let down: { x: number; y: number; prism: string | null } | null = null;
    const aim = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !store.get().active) return;
      aim(event);
      if (store.get().view === "lens" && layer.hitLens(raycaster.ray)) {
        event.stopImmediatePropagation();
        event.preventDefault();
        dragging = true;
        canvas.setPointerCapture(event.pointerId);
        store.setDragging(true);
        return;
      }
      down = { x: event.clientX, y: event.clientY, prism: layer.pickPrism(raycaster) };
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      event.stopImmediatePropagation();
      aim(event);
      const point = layer.pointOnLensPlane(raycaster.ray);
      if (point) store.moveLens(point);
    };
    const onUp = (event: PointerEvent) => {
      if (dragging) {
        event.stopImmediatePropagation();
        dragging = false;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        store.setDragging(false);
        return;
      }
      const start = down;
      down = null;
      if (!start || !layer.prismsVisible) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_SLOP_PX) return;
      aim(event);
      const code = layer.pickPrism(raycaster);
      if (code && code === start.prism) {
        event.stopImmediatePropagation();
        store.select(store.get().selected === code ? null : code);
      }
    };
    canvas.addEventListener("pointerdown", onDown, { capture: true });
    canvas.addEventListener("pointermove", onMove, { capture: true });
    canvas.addEventListener("pointerup", onUp, { capture: true });
    return () => {
      canvas.removeEventListener("pointerdown", onDown, { capture: true });
      canvas.removeEventListener("pointermove", onMove, { capture: true });
      canvas.removeEventListener("pointerup", onUp, { capture: true });
    };
  }, [camera, gl, layer, store]);

  const sa1 = census?.status === "ok" && selected ? census.sa1.find((s) => s.code === selected) ?? null : null;

  return (
    <>
      <primitive object={layer.root} />
      {sa1 ? (
        <group ref={calloutRef}>
          <Html className="people-callout-anchor" zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
            <div className="people-callout mono" data-testid="people-callout">
              <b>SA1 {sa1.code}</b>
              <span>{Math.round(sa1.values.pop).toLocaleString("en-AU")} people{sa1.fraction < 0.999 ? ` (${Math.round(sa1.fraction * 100)}% of area in cut)` : ""}</span>
              <span>
                {metric === "age"
                  ? `${Math.round(ageShare(sa1.values, band) * 100)}% aged ${AGE_BANDS[band]?.label ?? ""}`
                  : formatPrismValue(prismMetricValue(sa1, metric, band), metric)}
              </span>
              {sa1.values.medHhInc > 0 ? <span>${Math.round(sa1.values.medHhInc).toLocaleString("en-AU")}/wk median hhd income</span> : null}
            </div>
          </Html>
        </group>
      ) : null}
      {lensShown ? (
        <group ref={badgeRef}>
          <Html zIndexRange={[39, 0]} style={{ pointerEvents: "none" }}>
            <div className="people-lens-badge mono" data-testid="people-lens-badge">
              {Math.round(lensPeople).toLocaleString("en-AU")} people{lensEst ? " est." : ""} · {lensMinutes} min walk
            </div>
          </Html>
        </group>
      ) : null}
    </>
  );
}
