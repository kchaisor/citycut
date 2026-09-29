import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { addBuildingEdges } from "../lib/buildingEdges";
import { buildCityGroup, disposeObject } from "../lib/buildCity";
import type { CityModel } from "../types";

function CameraRig({ side, lift }: { side: number; lift: number }) {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.position.set(side * 0.78, lift + side * 0.62, side * 0.86);
    camera.near = Math.max(0.1, side / 400);
    camera.far = side * 40;
    camera.lookAt(0, lift + side * 0.03, 0);
    camera.updateProjectionMatrix();
  }, [camera, side, lift]);
  return null;
}

function City({
  model,
  uniformBuildings,
  colourBySource,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
}) {
  const group = useMemo(() => {
    const city = buildCityGroup(model, { uniformBuildings, colourBySource });
    const ground = city.getObjectByName("Ground");
    if (ground && ground instanceof THREE.Mesh && ground.name === "Ground") {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(ground.geometry),
        new THREE.LineBasicMaterial({ color: "#2c2924" }),
      );
      edges.position.copy(ground.position);
      edges.name = "GroundEdge";
      city.add(edges);
    }
    addBuildingEdges(city);
    return city;
  }, [model, uniformBuildings, colourBySource]);
  useEffect(() => () => disposeObject(group), [group]);
  return <primitive object={group} />;
}

export function Scene3D({
  model,
  uniformBuildings,
  colourBySource,
}: {
  model: CityModel;
  uniformBuildings: boolean;
  colourBySource: boolean;
}) {
  const lift = model.terrain ? (model.terrain.min + model.terrain.max) / 2 : 0;
  return (
    <Canvas
      className="scene-canvas"
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 32, position: [model.sideM, model.sideM, model.sideM] }}
    >
      <color attach="background" args={["#e7e4dc"]} />
      <hemisphereLight args={["#f7f4ee", "#c9c0b2", 0.7]} />
      <ambientLight intensity={0.28} />
      <directionalLight position={[model.sideM * 0.4, model.sideM, model.sideM * 0.2]} intensity={1.35} />
      <City model={model} uniformBuildings={uniformBuildings} colourBySource={colourBySource} />
      <CameraRig side={model.sideM} lift={lift} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={[0, lift + model.sideM * 0.02, 0]}
        maxPolarAngle={Math.PI / 2.02}
        minDistance={model.sideM * 0.2}
        maxDistance={model.sideM * 3.4}
      />
    </Canvas>
  );
}
