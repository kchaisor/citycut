import * as THREE from "three";
import { clipTransportLines } from "./dashedTransportLines";
import { getColour } from "./colours";
import { groundHeightAt } from "./viewshed";
import { buildStreetCentrality, edgePulseRate } from "./signalTraceCentrality";
import {
  heavyRailPulseSchedule,
  pulseSpacingMetres,
  SIGNAL_TRACE_RAIL_TRAVEL_MPS,
  tramPulseSchedule,
} from "./signalTraceHeadway";
import {
  computeRippleTimesNetwork,
  WALK_RIPPLE_TIMELINE_MAX_MIN,
  type RippleTimesNetwork,
} from "./walkRippleNetwork";
import {
  createRailTraceMaterial,
  createStreetTraceMaterial,
  signalTraceUniforms,
  type SignalTraceUniforms,
} from "./signalTraceShader";
import type { CityModel, Pt } from "../types";

const RENDER_ORDER = 950;
const LINE_LIFT_M = 0.65;
const STREET_HALF_WIDTH_M = 0.35;
const RAIL_HALF_WIDTH_M = 0.55;

function zAt(model: Pick<CityModel, "terrain" | "sideM">, east: number, north: number): number {
  return groundHeightAt(model, east, north);
}

type RibbonBuild = {
  positions: number[];
  pathDist: number[];
  pulseRate: number[];
  rippleArrival: number[];
};

function pushRibbonQuad(
  out: RibbonBuild,
  ax: number,
  ay: number,
  ta: number,
  bx: number,
  by: number,
  tb: number,
  hw: number,
  pulseHz: number,
  rippleA: number,
  rippleB: number,
  model: Pick<CityModel, "terrain" | "sideM">,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * hw;
  const oy = (dx / len) * hw;
  const corner = (e: number, n: number, dist: number, ripple: number) => {
    const z = zAt(model, e, n) + LINE_LIFT_M;
    out.positions.push(e, z, -n);
    out.pathDist.push(dist);
    out.pulseRate.push(pulseHz);
    out.rippleArrival.push(ripple);
  };
  corner(ax + ox, ay + oy, ta, rippleA);
  corner(ax - ox, ay - oy, ta, rippleA);
  corner(bx + ox, by + oy, tb, rippleB);
  corner(bx - ox, by - oy, tb, rippleB);
}

function meshFromRibbon(build: RibbonBuild, material: THREE.Material, name: string): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const count = build.positions.length / 3;
  geo.setAttribute("position", new THREE.Float32BufferAttribute(build.positions, 3));
  geo.setAttribute("aPathDist", new THREE.Float32BufferAttribute(build.pathDist, 1));
  geo.setAttribute("aPulseRate", new THREE.Float32BufferAttribute(build.pulseRate, 1));
  geo.setAttribute("aRippleArrival", new THREE.Float32BufferAttribute(build.rippleArrival, 1));
  const indices: number[] = [];
  for (let i = 0; i < count; i += 4) {
    indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  geo.setIndex(indices);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.renderOrder = RENDER_ORDER;
  mesh.frustumCulled = false;
  return mesh;
}

function polylineRibbon(
  line: Pt[],
  pulseHz: number,
  rippleTimes: Float32Array | null,
  rippleOffset: number,
  model: Pick<CityModel, "terrain" | "sideM">,
  hw: number,
): RibbonBuild {
  const out: RibbonBuild = { positions: [], pathDist: [], pulseRate: [], rippleArrival: [] };
  let dist = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i]!;
    const [bx, by] = line[i + 1]!;
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 0.05) continue;
    const ta = dist;
    const tb = dist + segLen;
    const rippleA = rippleTimes ? rippleTimes[rippleOffset + i * 2] ?? 999 : 999;
    const rippleB = rippleTimes ? rippleTimes[rippleOffset + i * 2 + 1] ?? 999 : 999;
    pushRibbonQuad(out, ax, ay, ta, bx, by, tb, hw, pulseHz, rippleA, rippleB, model);
    dist = tb;
  }
  return out;
}

export class SignalTraceLayer {
  readonly root = new THREE.Group();
  readonly uniforms: SignalTraceUniforms = signalTraceUniforms();
  private streetMesh: THREE.Mesh | null = null;
  private railMesh: THREE.Mesh | null = null;
  private tramMesh: THREE.Mesh | null = null;
  private disposeGeometries: THREE.BufferGeometry[] = [];
  private rippleTimes: RippleTimesNetwork | null = null;

  constructor(private readonly model: CityModel) {
    this.root.name = "SignalTrace";
    this.rebuild();
  }

  dispose(): void {
    this.clearMeshes();
  }

  private clearMeshes(): void {
    for (const child of [...this.root.children]) this.root.remove(child);
    for (const geo of this.disposeGeometries) geo.dispose();
    this.disposeGeometries = [];
    this.streetMesh = null;
    this.railMesh = null;
    this.tramMesh = null;
  }

  rebuild(): void {
    this.clearMeshes();
    const street = buildStreetCentrality(this.model.roads);
    const streetBuild: RibbonBuild = { positions: [], pathDist: [], pulseRate: [], rippleArrival: [] };
    if (street) {
      street.network.edges.forEach((edge, edgeIndex) => {
        const hz = edgePulseRate(street.edgeScore, edgeIndex);
        const rippleA = this.rippleTimes?.edgeVertexTimes[edgeIndex * 4] ?? 999;
        const rippleB = this.rippleTimes?.edgeVertexTimes[edgeIndex * 4 + 2] ?? 999;
        pushRibbonQuad(
          streetBuild,
          edge.ax,
          edge.ay,
          0,
          edge.bx,
          edge.by,
          edge.lengthM,
          STREET_HALF_WIDTH_M,
          hz,
          rippleA,
          rippleB,
          this.model,
        );
      });
    }
    if (streetBuild.positions.length > 0) {
      const mat = createStreetTraceMaterial(this.uniforms);
      this.streetMesh = meshFromRibbon(streetBuild, mat, "SignalTraceStreets");
      this.disposeGeometries.push(this.streetMesh.geometry);
      this.root.add(this.streetMesh);
    }

    const { rails, trams } = clipTransportLines(this.model);
    const tramHz = 1 / (tramPulseSchedule().headwayMin * 60);
    const railHz = 1 / (heavyRailPulseSchedule().headwayMin * 60);
    const tramSpacing = pulseSpacingMetres(tramPulseSchedule().headwayMin, SIGNAL_TRACE_RAIL_TRAVEL_MPS);
    const railSpacing = pulseSpacingMetres(heavyRailPulseSchedule().headwayMin, SIGNAL_TRACE_RAIL_TRAVEL_MPS);
    const tramPulse = (2 * Math.PI) / tramSpacing;
    const railPulse = (2 * Math.PI) / railSpacing;

    const tramBuild: RibbonBuild = { positions: [], pathDist: [], pulseRate: [], rippleArrival: [] };
    for (const line of trams) {
      const part = polylineRibbon(line, tramPulse, null, 0, this.model, RAIL_HALF_WIDTH_M);
      tramBuild.positions.push(...part.positions);
      tramBuild.pathDist.push(...part.pathDist);
      tramBuild.pulseRate.push(...part.pulseRate);
      tramBuild.rippleArrival.push(...part.rippleArrival);
    }
    if (tramBuild.positions.length > 0) {
      const mat = createRailTraceMaterial(this.uniforms);
      this.tramMesh = meshFromRibbon(tramBuild, mat, "SignalTraceTram");
      this.disposeGeometries.push(this.tramMesh.geometry);
      this.root.add(this.tramMesh);
    }

    const railBuild: RibbonBuild = { positions: [], pathDist: [], pulseRate: [], rippleArrival: [] };
    for (const line of rails) {
      const part = polylineRibbon(line, railPulse, null, 0, this.model, RAIL_HALF_WIDTH_M);
      railBuild.positions.push(...part.positions);
      railBuild.pathDist.push(...part.pathDist);
      railBuild.pulseRate.push(...part.pulseRate);
      railBuild.rippleArrival.push(...part.rippleArrival);
    }
    if (railBuild.positions.length > 0) {
      const mat = createRailTraceMaterial(this.uniforms);
      this.railMesh = meshFromRibbon(railBuild, mat, "SignalTraceRail");
      this.disposeGeometries.push(this.railMesh.geometry);
      this.root.add(this.railMesh);
    }
    void tramHz;
    void railHz;
  }

  setSourceOrigin(east: number, north: number): void {
    const street = buildStreetCentrality(this.model.roads);
    if (!street) {
      this.rippleTimes = null;
      this.uniforms.uRippleTime.value = -1;
      this.rebuild();
      return;
    }
    this.rippleTimes = computeRippleTimesNetwork(street.network, east, north);
    this.uniforms.uRippleMax.value = WALK_RIPPLE_TIMELINE_MAX_MIN;
    this.uniforms.uRippleTime.value = 0;
    this.rebuild();
  }

  clearSource(): void {
    this.rippleTimes = null;
    this.uniforms.uRippleTime.value = -1;
    this.rebuild();
  }

  setRippleMinutes(minutes: number): void {
    if (!this.rippleTimes) {
      this.uniforms.uRippleTime.value = -1;
      return;
    }
    this.uniforms.uRippleTime.value = Math.max(0, Math.min(WALK_RIPPLE_TIMELINE_MAX_MIN, minutes));
  }

  refreshColours(): void {
    this.uniforms.uStreetDim.value.setStyle(getColour("--signal-trace-street-dim"));
    this.uniforms.uStreetPulse.value.setStyle(getColour("--signal-trace-street-pulse"));
    this.uniforms.uRailPulse.value.setStyle(getColour("--signal-trace-rail-pulse"));
    this.uniforms.uRippleAccent.value.setStyle(getColour("--signal-trace-afterglow"));
  }
}
