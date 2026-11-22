import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityModel } from "../types";
import { getColour } from "../lib/colours";
import { moveToPostOverlay, retainPostOverlay, setPostOverlayDeferred } from "../lib/postOverlay";
import { useColourRevision } from "../lib/useColourRevision";
import {
  createStreamFanMesh,
  layoutStreamFans,
  streamArrowCount,
  streamPlaneHeightM,
  tintStreamFanMesh,
  writeStreamAlphas,
  type StreamFanMesh,
} from "../lib/windDiagramStreams";
import type { PrevailingStream } from "../lib/windPrevailingStreams";
import { advanceWindClock, type WindClock } from "../lib/windStreakMotion";

declare global {
  interface Window {
    __citycutWindStreams?: { readonly arrows: number; readonly sectors: readonly number[]; readonly seconds: number };
  }
}

const MAX_FRAME_DT = 0.1;

export function WindDiagramStreams({
  model,
  streams,
  animate,
}: {
  model: CityModel;
  streams: readonly PrevailingStream[];
  animate: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const colourRevision = useColourRevision();
  const clock = useRef<WindClock>({ seconds: 0 });
  const drawnAt = useRef(-1);
  const animateRef = useRef(animate);
  animateRef.current = animate;

  const halfWidthM = (model.widthM ?? model.sideM) / 2;
  const halfHeightM = (model.heightM ?? model.sideM) / 2;
  const fans = useMemo(() => layoutStreamFans(streams, { halfWidthM, halfHeightM }), [streams, halfWidthM, halfHeightM]);
  const planeY = useMemo(() => {
    const base = model.terrain ? (model.terrain.min + model.terrain.max) / 2 : 0;
    return base + streamPlaneHeightM(model.buildings.map((building) => building.height));
  }, [model]);

  const root = useMemo(() => {
    const group = new THREE.Group();
    group.name = "WindDiagramStreams";
    for (const fan of fans) group.add(createStreamFanMesh(fan, planeY));
    moveToPostOverlay(group);
    drawnAt.current = -1;
    return group;
  }, [fans, planeY]);

  useEffect(
    () => () => {
      for (const child of root.children as StreamFanMesh[]) {
        child.geometry.dispose();
        child.material.dispose();
      }
    },
    [root],
  );

  useEffect(() => {
    for (const child of root.children as StreamFanMesh[]) tintStreamFanMesh(child, getColour);
    invalidate();
  }, [root, colourRevision, invalidate]);

  useEffect(() => {
    setPostOverlayDeferred(camera, false);
    return retainPostOverlay(scene);
  }, [scene, camera]);

  useEffect(() => {
    invalidate();
  }, [animate, invalidate]);

  useEffect(() => {
    window.__citycutWindStreams = {
      arrows: streamArrowCount(fans),
      sectors: fans.map((fan) => fan.sector),
      get seconds() {
        return clock.current.seconds;
      },
    };
    return () => {
      delete window.__citycutWindStreams;
    };
  }, [fans]);

  useFrame((_, delta) => {
    const seconds = advanceWindClock(clock.current, Math.min(delta, MAX_FRAME_DT), !animateRef.current);
    if (seconds !== drawnAt.current) {
      drawnAt.current = seconds;
      for (const child of root.children as StreamFanMesh[]) {
        writeStreamAlphas(child.userData.fan, seconds, child.userData.colours);
        child.geometry.getAttribute("color").needsUpdate = true;
      }
    }
    if (animateRef.current) invalidate();
  });

  return <primitive object={root} />;
}
