import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { COLOUR_FALLBACK, getColour } from "./colours";
import { applySolarGreyscale } from "./solarGreyscale";
import { SECTOR_LABELS, downwindFromSector } from "./windRose";
import {
  STREAM_FADE_IN,
  STREAM_FADE_OUT,
  STREAM_INDICES_PER_ARROW,
  STREAM_PERIOD_MAX_S,
  STREAM_PERIOD_MIN_S,
  STREAM_RENDER_ORDER,
  STREAM_VERTS_PER_ARROW,
  createStreamFanMesh,
  layoutStreamFans,
  streamArrowCount,
  streamFanClearanceM,
  streamPlaneHeightM,
  streamPoseSeconds,
  streamTrackPoint,
  streamTravelFade,
  streamTravelPeriodS,
  streamTravelPose,
  streamTravelProgress,
  tintStreamFanMesh,
  withStreamStillFrame,
  writeStreamFanPose,
  type StreamArrow,
  type StreamFan,
  type StreamFanMesh,
  type StreamSite,
} from "./windDiagramStreams";
import { advanceWindClock } from "./windStreakMotion";
import { sunDomeRange } from "./heliodonRadius";
import { windStreakStillArrows } from "./rhinoExport";
import { PREVAILING_STREAM_MAX_ARROWS, PREVAILING_STREAM_TOKENS, type PrevailingStream } from "./windPrevailingStreams";

const SITE = { halfWidthM: 250, halfHeightM: 250 };
const ARROWS = [5, 4, 3];
const REACH = [1, 0.84, 0.74];

function streamsFrom(sectors: readonly number[]): PrevailingStream[] {
  return sectors.map((sector, rank) => ({
    rank,
    sector,
    label: SECTOR_LABELS[sector]!,
    fromDeg: sector * 22.5,
    share: 0.3 - rank * 0.08,
    meanSpeedMs: 4 - rank,
    arrows: ARROWS[rank]!,
    reach: REACH[rank]!,
    token: PREVAILING_STREAM_TOKENS[rank]!,
    legend: "",
  }));
}

function arrowLengthM(arrow: StreamArrow): number {
  let total = 0;
  for (let i = 1; i < arrow.centre.length; i++) {
    total += Math.hypot(arrow.centre[i]!.east - arrow.centre[i - 1]!.east, arrow.centre[i]!.north - arrow.centre[i - 1]!.north);
  }
  return total;
}

function widthAt(arrow: StreamArrow, step: number): number {
  const a = step * 2;
  return Math.hypot(
    arrow.positions[a * 2]! - arrow.positions[(a + 1) * 2]!,
    arrow.positions[a * 2 + 1]! - arrow.positions[(a + 1) * 2 + 1]!,
  );
}

const TRIPLES: readonly (readonly number[])[] = [
  [0, 1, 8],
  [8, 7, 9],
  [0, 8, 9],
  [12, 13, 11],
  [2, 8, 12],
  [0, 4, 8],
  [14, 6, 2],
  [0, 15, 14],
  [5, 6, 7],
  [3, 11, 15],
];

describe("wind diagram fans", () => {
  it("draws one fan per stream: five, four and three arrows, never more than twelve", () => {
    const fans = layoutStreamFans(streamsFrom([0, 1, 8]), SITE);
    expect(fans.map((fan) => fan.arrows.length)).toEqual([5, 4, 3]);
    expect(streamArrowCount(fans)).toBe(12);
    expect(streamArrowCount(fans)).toBeLessThanOrEqual(PREVAILING_STREAM_MAX_ARROWS);
    expect(fans.map((fan) => fan.token)).toEqual(["--wind-stream-1", "--wind-stream-2", "--wind-stream-3"]);
    expect(layoutStreamFans([], SITE)).toEqual([]);
  });

  it("flows downwind: a north wind's arrows run toward the south", () => {
    for (const triple of TRIPLES) {
      const streams = streamsFrom(triple);
      layoutStreamFans(streams, SITE).forEach((fan, i) => {
        const flow = downwindFromSector(streams[i]!.sector);
        for (const arrow of fan.arrows) {
          const tail = arrow.centre[0]!;
          const tip = arrow.centre.at(-1)!;
          const run = (tip.east - tail.east) * flow.east + (tip.north - tail.north) * flow.north;
          expect(run / arrowLengthM(arrow), `${triple} fan ${i}`).toBeGreaterThan(0.85);
        }
      });
    }
    const north = layoutStreamFans(streamsFrom([0]), SITE)[0]!.arrows[0]!;
    expect(north.centre.at(-1)!.north).toBeLessThan(north.centre[0]!.north - 200);
  });

  it("keeps the three fans in separate bands so no group cuts across another", () => {
    for (const triple of TRIPLES) {
      const fans = layoutStreamFans(streamsFrom(triple), SITE);
      expect(streamFanClearanceM(fans), triple.map((s) => SECTOR_LABELS[s]).join(",")).toBeGreaterThan(40);
    }
  });

  it("makes the strongest fan the longest and varies the lengths inside each fan", () => {
    const fans = layoutStreamFans(streamsFrom([0, 4, 8]), SITE);
    const longest = fans.map((fan) => Math.max(...fan.arrows.map(arrowLengthM)));
    expect(longest[0]!).toBeGreaterThan(longest[1]!);
    expect(longest[1]!).toBeGreaterThan(longest[2]!);
    for (const fan of fans) {
      const lengths = fan.arrows.map(arrowLengthM);
      expect(new Set(lengths.map((l) => Math.round(l))).size).toBe(lengths.length);
      expect(Math.min(...lengths)).toBeLessThan(Math.max(...lengths) * 0.7);
    }
  });

  it("bends every arrow into a gentle swoop rather than a ruler line", () => {
    const fans = layoutStreamFans(streamsFrom([0, 4, 8]), SITE);
    for (const fan of fans) {
      const bent = fan.arrows.filter((arrow) => {
        const tail = arrow.centre[0]!;
        const tip = arrow.centre.at(-1)!;
        const chord = Math.hypot(tip.east - tail.east, tip.north - tail.north);
        const length = arrowLengthM(arrow);
        expect(chord / length).toBeGreaterThan(0.9);
        return length - chord > 0.2;
      });
      expect(bent.length).toBeGreaterThanOrEqual(fan.arrows.length - 1);
    }
  });

  it("tapers each arrow from a hairline tail to a thicker neck and a sharp, narrow head", () => {
    const arrow = layoutStreamFans(streamsFrom([0]), SITE)[0]!.arrows[0]!;
    const steps = (STREAM_VERTS_PER_ARROW - 3) / 2 - 1;
    const tail = widthAt(arrow, 0);
    const neck = widthAt(arrow, steps);
    expect(tail).toBeLessThan(2);
    expect(neck).toBeGreaterThan(tail * 4);
    expect(neck).toBeGreaterThan(7);
    expect(neck).toBeLessThan(12);
    for (let i = 1; i <= steps; i++) expect(widthAt(arrow, i)).toBeGreaterThanOrEqual(widthAt(arrow, i - 1));
    const base = (steps + 1) * 2;
    const headWidth = Math.hypot(
      arrow.positions[base * 2]! - arrow.positions[(base + 1) * 2]!,
      arrow.positions[base * 2 + 1]! - arrow.positions[(base + 1) * 2 + 1]!,
    );
    const tip = arrow.centre.at(-1)!;
    const headLength = Math.hypot(
      tip.east - (arrow.positions[base * 2]! + arrow.positions[(base + 1) * 2]!) / 2,
      tip.north - (arrow.positions[base * 2 + 1]! + arrow.positions[(base + 1) * 2 + 1]!) / 2,
    );
    expect(headWidth).toBeGreaterThan(neck * 2);
    expect(headLength).toBeGreaterThan(headWidth);
    expect(arrow.along.at(-1)).toBe(1);
    expect(arrow.indices).toHaveLength(STREAM_INDICES_PER_ARROW);
  });

  it("sits a few metres above the typical roofs, not on the tallest tower", () => {
    const heights = [...Array.from({ length: 90 }, () => 12), ...Array.from({ length: 10 }, () => 180)];
    expect(streamPlaneHeightM(heights)).toBe(18);
    expect(streamPlaneHeightM([])).toBe(12);
    expect(streamPlaneHeightM([3, 3, 3])).toBe(12);
  });
});

describe("wind diagram meshes", () => {
  const fans = layoutStreamFans(streamsFrom([0, 1, 8]), SITE);

  it("builds flat, zero-thickness, unlit shapes on one plane with no outline and no shadows", () => {
    for (const fan of fans) {
      const mesh = createStreamFanMesh(fan, 30);
      const positions = mesh.geometry.getAttribute("position");
      expect(positions.count).toBe(fan.arrows.length * STREAM_VERTS_PER_ARROW);
      for (let i = 0; i < positions.count; i++) expect(positions.getY(i)).toBe(30);
      expect(mesh.geometry.getIndex()!.count).toBe(fan.arrows.length * STREAM_INDICES_PER_ARROW);
      expect(mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(mesh.material.toneMapped).toBe(false);
      expect(mesh.material.depthWrite).toBe(false);
      expect(mesh.material.side).toBe(THREE.DoubleSide);
      expect(mesh.castShadow).toBe(false);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.children).toHaveLength(0);
      expect(mesh.renderOrder).toBe(STREAM_RENDER_ORDER + fan.rank);
    }
  });

  it("puts north at -z, the same way as the ground-flow", () => {
    const mesh = createStreamFanMesh(layoutStreamFans(streamsFrom([0]), SITE)[0]!, 0);
    const positions = mesh.geometry.getAttribute("position");
    const tipIndex = STREAM_VERTS_PER_ARROW - 1;
    expect(positions.getZ(tipIndex)).toBeGreaterThan(positions.getZ(0) + 200);
  });

  it("uses the three wind-stream tokens", () => {
    expect(COLOUR_FALLBACK["--wind-stream-1"]).toBe("#6D9BC7");
    expect(COLOUR_FALLBACK["--wind-stream-2"]).toBe("#8FBEA3");
    expect(COLOUR_FALLBACK["--wind-stream-3"]).toBe("#C3A6CF");
    const hexes = fans.map((fan) => {
      const mesh = createStreamFanMesh(fan, 0);
      tintStreamFanMesh(mesh, getColour);
      return `#${mesh.material.color.getHexString().toUpperCase()}`;
    });
    expect(hexes).toEqual(["#6D9BC7", "#8FBEA3", "#C3A6CF"]);
  });

  it("stays blue, sage and lilac when the B&W view style greys the city", () => {
    const city = new THREE.Group();
    const building = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#C0392B" }));
    city.add(building);
    const streams = new THREE.Group();
    const meshes = fans.map((fan) => {
      const mesh = createStreamFanMesh(fan, 0);
      tintStreamFanMesh(mesh, getColour);
      streams.add(mesh);
      return mesh;
    });
    const scene = new THREE.Scene();
    scene.add(city, streams);
    applySolarGreyscale(city, true);
    const grey = building.material.color;
    expect(grey.r).toBeCloseTo(grey.g, 5);
    expect(grey.g).toBeCloseTo(grey.b, 5);
    expect(meshes.map((mesh) => `#${mesh.material.color.getHexString().toUpperCase()}`)).toEqual(["#6D9BC7", "#8FBEA3", "#C3A6CF"]);
    const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
    const scene3d = source("src/components/Scene3D.tsx");
    expect(scene3d).toContain("applySolarGreyscale(group, solarGreyscale);");
    expect(scene3d.indexOf("<WindDiagramStreams")).toBeGreaterThan(scene3d.indexOf("<SolarHeliodon"));
    expect(source("src/components/WindDiagramStreams.tsx")).toContain("moveToPostOverlay(group);");
  });
});

const WIDE_SITE = { halfWidthM: 400, halfHeightM: 250 };
const EDGE_EPSILON_M = 1;
const TAIL_ALPHA_FLOOR = Math.fround(0.45);

function meshPositions(mesh: StreamFanMesh): number[] {
  return Array.from(mesh.geometry.getAttribute("position").array);
}

function meshAlphas(mesh: StreamFanMesh): number[] {
  return Array.from({ length: mesh.userData.colours.length / 4 }, (_, i) => mesh.userData.colours[i * 4 + 3]!);
}

function expectInsideCut(mesh: StreamFanMesh, site: StreamSite, label: string) {
  const positions = mesh.geometry.getAttribute("position");
  let east = 0;
  let north = 0;
  for (let i = 0; i < positions.count; i++) {
    east = Math.max(east, Math.abs(positions.getX(i)));
    north = Math.max(north, Math.abs(positions.getZ(i)));
  }
  expect(east, label).toBeLessThanOrEqual(site.halfWidthM + EDGE_EPSILON_M);
  expect(north, label).toBeLessThanOrEqual(site.halfHeightM + EDGE_EPSILON_M);
}

function fanAlphas(fan: StreamFan, seconds: number): number[] {
  return fan.arrows.map((arrow) => streamTravelFade(streamTravelProgress(seconds, fan.periodS, arrow.phase)));
}

describe("wind diagram travel loop", () => {
  const fans = layoutStreamFans(streamsFrom([0, 1, 8]), SITE);

  it("fades in at the upwind start, holds fully visible, and fades to nothing at the far end", () => {
    expect(streamTravelFade(0)).toBe(0);
    expect(streamTravelFade(1)).toBe(0);
    expect(streamTravelFade(STREAM_FADE_IN / 2)).toBeGreaterThan(0.2);
    expect(streamTravelFade(STREAM_FADE_IN / 2)).toBeLessThan(0.8);
    expect(streamTravelFade(STREAM_FADE_IN)).toBe(1);
    expect(streamTravelFade(0.5)).toBe(1);
    expect(streamTravelFade(1 - STREAM_FADE_OUT)).toBe(1);
    expect(streamTravelFade(1 - STREAM_FADE_OUT / 2)).toBeLessThan(0.8);
    for (let p = 0.01; p <= STREAM_FADE_IN; p += 0.01) expect(streamTravelFade(p)).toBeGreaterThan(streamTravelFade(p - 0.01));
    for (let p = 1 - STREAM_FADE_OUT + 0.01; p <= 1; p += 0.01) expect(streamTravelFade(p)).toBeLessThan(streamTravelFade(p - 0.01));
  });

  it("slides each dart downwind along its own curved path, from the upwind start to the far end, then loops", () => {
    for (const triple of TRIPLES) {
      const streams = streamsFrom(triple);
      layoutStreamFans(streams, SITE).forEach((fan, i) => {
        const flow = downwindFromSector(streams[i]!.sector);
        for (const arrow of fan.arrows) {
          const { track } = arrow;
          const start = streamTravelPose(arrow, 0);
          const end = streamTravelPose(arrow, 1);
          expect(start.tailM).toBe(track.fromM);
          expect(start.alpha).toBe(0);
          expect(end.tipM).toBeCloseTo(track.toM, 6);
          expect(end.alpha).toBe(0);
          expect(end.tipM - start.tipM, `${triple} fan ${i}`).toBeGreaterThan(100);
          let previous = start;
          for (let p = 0.05; p <= 1.0001; p += 0.05) {
            const pose = streamTravelPose(arrow, Math.min(1, p));
            expect(pose.tipM).toBeGreaterThan(previous.tipM);
            expect(pose.tailM).toBeGreaterThanOrEqual(previous.tailM);
            expect(pose.tipM - pose.tailM).toBeLessThanOrEqual(arrow.lengthM + 1e-6);
            const from = streamTrackPoint(track, previous.tipM);
            const to = streamTrackPoint(track, pose.tipM);
            expect((to.east - from.east) * flow.east + (to.north - from.north) * flow.north).toBeGreaterThan(0);
            previous = pose;
          }
          expect(track.fromM).toBeLessThanOrEqual(arrow.restTailM);
          expect(track.toM).toBeGreaterThanOrEqual(arrow.restTailM + arrow.lengthM - 1e-3);
        }
        expect(streamTravelProgress(fan.periodS * 3 + 1, fan.periodS, 0.25)).toBeCloseTo(streamTravelProgress(1, fan.periodS, 0.25), 9);
      });
    }
  });

  it("staggers the arrows so every fan always has one fully visible and never pops as a whole", () => {
    for (const triple of [...TRIPLES, [4]]) {
      const laidOut = layoutStreamFans(streamsFrom(triple), SITE);
      for (const fan of laidOut) {
        expect(new Set(fan.arrows.map((arrow) => arrow.phase.toFixed(3))).size).toBe(fan.arrows.length);
        for (let seconds = 0.05; seconds < 90; seconds += 0.05) {
          const alphas = fanAlphas(fan, seconds);
          expect(Math.max(...alphas)).toBe(1);
          expect(alphas.filter((alpha) => alpha < 0.5).length).toBeLessThan(fan.arrows.length - 1);
        }
      }
      for (let seconds = 0.05; seconds < 90; seconds += 0.05) {
        const fading = laidOut.flatMap((fan) => fanAlphas(fan, seconds)).filter((alpha) => alpha < 0.5).length;
        expect(fading).toBeLessThanOrEqual(streamArrowCount(laidOut) / 2);
      }
    }
  });

  it("travels faster in a faster stream, but always at a calm pace", () => {
    expect(streamTravelPeriodS(8)).toBeLessThan(streamTravelPeriodS(4));
    expect(streamTravelPeriodS(4)).toBeLessThan(streamTravelPeriodS(3));
    expect(streamTravelPeriodS(1)).toBe(STREAM_PERIOD_MAX_S);
    expect(streamTravelPeriodS(0)).toBe(STREAM_PERIOD_MAX_S);
    expect(streamTravelPeriodS(Number.NaN)).toBe(STREAM_PERIOD_MAX_S);
    expect(streamTravelPeriodS(40)).toBe(STREAM_PERIOD_MIN_S);
    expect(STREAM_PERIOD_MIN_S).toBeGreaterThanOrEqual(5);
    const paced = (meanSpeedMs: number) => {
      const fan = layoutStreamFans([{ ...streamsFrom([0])[0]!, meanSpeedMs }], SITE)[0]!;
      const arrow = fan.arrows[0]!;
      const tipAt = (seconds: number) => streamTravelPose(arrow, streamTravelProgress(seconds, fan.periodS, 0)).tipM;
      return tipAt(2) - tipAt(1);
    };
    expect(paced(8)).toBeGreaterThan(paced(3));
    for (const speed of [0.5, 3, 8, 40]) {
      expect(paced(speed)).toBeGreaterThan(0);
      expect(paced(speed)).toBeLessThan((SITE.halfWidthM * 2) / 5);
    }
    expect(fans.map((fan) => fan.periodS)).toEqual([4, 3, 2].map(streamTravelPeriodS));
  });

  it("freezes the travelling pose on Pause and carries on from it on Play", () => {
    const mesh = createStreamFanMesh(fans[0]!, 0);
    const clock = { seconds: 0 };
    const draw = () => {
      writeStreamFanPose(mesh, streamPoseSeconds(clock.seconds));
      return { positions: meshPositions(mesh), alphas: meshAlphas(mesh) };
    };
    advanceWindClock(clock, 2.4, false);
    const playing = draw();
    advanceWindClock(clock, 5, true);
    advanceWindClock(clock, 0.016, true);
    expect(clock.seconds).toBe(2.4);
    expect(draw()).toEqual(playing);
    advanceWindClock(clock, 0.5, false);
    const resumed = draw();
    expect(resumed.positions).not.toEqual(playing.positions);
    writeStreamFanPose(mesh, 2.9);
    expect(meshPositions(mesh)).toEqual(resumed.positions);
    expect(meshAlphas(mesh)).toEqual(resumed.alphas);
    const arrow = fans[0]!.arrows[0]!;
    const before = streamTravelPose(arrow, streamTravelProgress(2.4, fans[0]!.periodS, arrow.phase));
    const after = streamTravelPose(arrow, streamTravelProgress(2.9, fans[0]!.periodS, arrow.phase));
    expect(after.tipM - before.tipM).toBeGreaterThan(0);
    expect(after.tipM - before.tipM).toBeLessThan(60);
  });

  it("moves the darts by rewriting the same buffers, never by rebuilding the geometry", () => {
    const mesh = createStreamFanMesh(fans[0]!, 22);
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute("position").array;
    const index = geometry.getIndex()!.array;
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const version = attribute.version;
    for (const seconds of [0.4, 3.1, 7.7]) writeStreamFanPose(mesh, seconds);
    expect(mesh.geometry).toBe(geometry);
    expect(geometry.getAttribute("position").array).toBe(positions);
    expect(geometry.getIndex()!.array).toBe(index);
    expect(geometry.getAttribute("position")).toBe(attribute);
    expect(attribute.version).toBeGreaterThan(version);
    for (let i = 0; i < geometry.getAttribute("position").count; i++) expect(geometry.getAttribute("position").getY(i)).toBe(22);
    for (let i = 0; i < mesh.userData.colours.length; i += 4) {
      expect([mesh.userData.colours[i], mesh.userData.colours[i + 1], mesh.userData.colours[i + 2]]).toEqual([1, 1, 1]);
    }
  });

  it("shows a still, fully visible rest pose until the clock first runs (reduced motion)", () => {
    expect(streamPoseSeconds(0)).toBeNull();
    expect(streamPoseSeconds(0.016)).toBe(0.016);
    const fan = fans[0]!;
    const mesh = createStreamFanMesh(fan, 0);
    const rest = { positions: meshPositions(mesh), alphas: meshAlphas(mesh) };
    writeStreamFanPose(mesh, streamPoseSeconds(advanceWindClock({ seconds: 0 }, 0.016, true)));
    expect({ positions: meshPositions(mesh), alphas: meshAlphas(mesh) }).toEqual(rest);
    expect(mesh.userData.poseSeconds).toBeNull();
    fan.arrows.forEach((arrow, k) => {
      const base = k * STREAM_VERTS_PER_ARROW;
      for (let i = 0; i < STREAM_VERTS_PER_ARROW; i++) {
        expect(rest.positions[(base + i) * 3]).toBe(arrow.positions[i * 2]);
        expect(rest.positions[(base + i) * 3 + 2]).toBe(-arrow.positions[i * 2 + 1]!);
        expect(rest.alphas[base + i]).toBeGreaterThanOrEqual(TAIL_ALPHA_FLOOR);
      }
      expect(rest.alphas[base + STREAM_VERTS_PER_ARROW - 1]).toBe(1);
    });
  });

  it("fades travelling arrows to nothing at the end of their path, and with no dome still fills the cut (no 7% inset)", () => {
    for (const site of [SITE, WIDE_SITE]) {
      for (const triple of [...TRIPLES, [2], [9]]) {
        for (const fan of layoutStreamFans(streamsFrom(triple), site)) {
          const mesh = createStreamFanMesh(fan, 0);
          for (let seconds = 0.25; seconds < 2 * fan.periodS; seconds += 0.25) {
            writeStreamFanPose(mesh, seconds);
          }
          for (const arrow of fan.arrows) {
            expect(streamTravelPose(arrow, 1).tipM).toBeLessThanOrEqual(arrow.track.cum.at(-1)! + 1e-3);
            expect(streamTravelPose(arrow, 1).alpha).toBe(0);
            expect(streamTravelPose(arrow, 0.999).alpha).toBeLessThan(0.001);
          }
        }
      }
    }
  });

  it("keeps a travelling fan from cutting across another fan", () => {
    const dartLine = (arrow: StreamArrow, fan: StreamFan, seconds: number) => {
      const pose = streamTravelPose(arrow, streamTravelProgress(seconds, fan.periodS, arrow.phase));
      return Array.from({ length: 13 }, (_, i) => streamTrackPoint(arrow.track, pose.tailM + ((pose.tipM - pose.tailM) * i) / 12));
    };
    for (const triple of TRIPLES) {
      const laidOut = layoutStreamFans(streamsFrom(triple), SITE);
      let closest = Infinity;
      for (let seconds = 0.5; seconds < 30; seconds += 0.5) {
        const lines = laidOut.map((fan) => fan.arrows.flatMap((arrow) => dartLine(arrow, fan, seconds)));
        for (let a = 0; a < lines.length; a++) {
          for (let b = a + 1; b < lines.length; b++) {
            for (const p of lines[a]!) for (const q of lines[b]!) closest = Math.min(closest, Math.hypot(p.east - q.east, p.north - q.north));
          }
        }
      }
      expect(closest, triple.join(",")).toBeGreaterThan(25);
    }
  });
});

describe("wind diagram still frame for exports", () => {
  const fans = layoutStreamFans(streamsFrom([0, 1, 8]), SITE);
  const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

  it("renders exports from the still pose, fully visible, then puts the travelling pose back", () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    const meshes = fans.map((fan) => createStreamFanMesh(fan, 30));
    group.add(...meshes);
    scene.add(group, new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    const pausedMidFade = fans[0]!.periodS * (1 - fans[0]!.arrows[0]!.phase) - 0.05;
    for (const mesh of meshes) writeStreamFanPose(mesh, pausedMidFade);
    const travelling = meshes.map((mesh) => ({ positions: meshPositions(mesh), alphas: meshAlphas(mesh) }));
    expect(Math.min(...travelling[0]!.alphas)).toBeLessThan(0.05);
    const captured = withStreamStillFrame(scene, () => {
      meshes.forEach((mesh, f) => {
        expectInsideCut(mesh, SITE, "export still");
        const alphas = meshAlphas(mesh);
        expect(Math.min(...alphas)).toBeGreaterThanOrEqual(TAIL_ALPHA_FLOOR);
        fans[f]!.arrows.forEach((arrow, k) => {
          const base = k * STREAM_VERTS_PER_ARROW;
          expect(alphas[base + STREAM_VERTS_PER_ARROW - 1]).toBe(1);
          expect(mesh.geometry.getAttribute("position").getX(base + STREAM_VERTS_PER_ARROW - 1)).toBe(arrow.positions.at(-2));
        });
      });
      return "frame";
    });
    expect(captured).toBe("frame");
    meshes.forEach((mesh, f) => {
      expect(mesh.userData.poseSeconds).toBe(pausedMidFade);
      expect({ positions: meshPositions(mesh), alphas: meshAlphas(mesh) }).toEqual(travelling[f]);
    });
  });

  it("puts the travelling pose back even when the render throws", () => {
    const scene = new THREE.Scene();
    const mesh = createStreamFanMesh(fans[0]!, 0);
    scene.add(mesh);
    writeStreamFanPose(mesh, 4.2);
    const travelling = meshPositions(mesh);
    expect(() =>
      withStreamStillFrame(scene, () => {
        throw new Error("lost context");
      }),
    ).toThrow("lost context");
    expect(meshPositions(mesh)).toEqual(travelling);
  });

  it("wires the still frame into the PNG capture and the Rhino download, and nowhere into Drawing or .ai", () => {
    const capture = source("src/lib/capturePng.ts");
    expect(capture).toMatch(/withStreamStillFrame\(scene, \(\) =>\s+withScreenOnlyHidden\(scene, \(\) => \{\s+gl\.render\(scene, renderCamera\);/);
    const scene3d = source("src/components/Scene3D.tsx");
    const bridge = scene3d.slice(scene3d.indexOf("function ExportBridge("), scene3d.indexOf("function CameraMemoryBridge("));
    expect(bridge).toContain("captureViewPng(gl, scene,");
    expect(source("src/components/model/useModelPage.tsx")).toContain(
      "windStreaks: windDiagramActive(windStreaksOn, analyses) ? windStreams : null,",
    );
    for (const file of ["src/lib/aiPlan.ts", "src/lib/aiView.ts", "src/lib/svgPlan.ts", "src/lib/planRhinoExport.ts", "src/components/DrawingPlan.tsx"]) {
      expect(source(file), file).not.toContain("windDiagramStreams");
    }
  });
});

describe("wind streak fans follow the sun dome radius", () => {
  const CUTS = [
    { name: "0.5 km square", sideM: 500, widthM: 500, heightM: 500 },
    { name: "Rozelle A3", sideM: 1470, widthM: 1470, heightM: 1040 },
  ] as const;
  const radii = (cut: (typeof CUTS)[number]) => {
    const range = sunDomeRange(cut);
    return [range.minM, range.autoM, (range.autoM + range.maxM) / 2, range.maxM];
  };
  const siteOf = (cut: (typeof CUTS)[number], spreadRadiusM: number | null = null): StreamSite => ({
    halfWidthM: cut.widthM / 2,
    halfHeightM: cut.heightM / 2,
    spreadRadiusM,
  });
  const reachM = (fans: readonly StreamFan[]) =>
    Math.max(...fans.flatMap((fan) => fan.arrows.flatMap((arrow) => arrow.centre.map((p) => Math.hypot(p.east, p.north)))));
  const meanTailM = (fans: readonly StreamFan[]) => {
    const tails = fans.flatMap((fan) => fan.arrows.map((arrow) => Math.hypot(arrow.centre[0]!.east, arrow.centre[0]!.north)));
    return tails.reduce((sum, tail) => sum + tail, 0) / tails.length;
  };

  it("keeps every arrow the same length, shaft width and head size at 0.5× auto, auto and 2× the cut edge", () => {
    for (const cut of CUTS) {
      for (const triple of TRIPLES) {
        const streams = streamsFrom(triple);
        const onCut = layoutStreamFans(streams, siteOf(cut)).flatMap((fan) => fan.arrows);
        for (const radius of radii(cut)) {
          const arrows = layoutStreamFans(streams, siteOf(cut, radius)).flatMap((fan) => fan.arrows);
          expect(arrows).toHaveLength(onCut.length);
          arrows.forEach((arrow, k) => {
            const label = `${cut.name} ${triple.join("/")} r=${Math.round(radius)} arrow ${k}`;
            expect(arrow.lengthM, label).toBeCloseTo(onCut[k]!.lengthM, 6);
            expect(arrow.shape, label).toEqual(onCut[k]!.shape);
            expect(arrowLengthM(arrow), label).toBeCloseTo(arrowLengthM(onCut[k]!), 0);
            expect(widthAt(arrow, 20), label).toBeCloseTo(widthAt(onCut[k]!, 20), 3);
          });
        }
      }
    }
  });

  it("does not scale a single design-wind fan's arrows either, only where it sits", () => {
    const cut = CUTS[0];
    const range = sunDomeRange(cut);
    const fanAt = (radius: number) => layoutStreamFans(streamsFrom([3]), siteOf(cut, radius))[0]!;
    const small = fanAt(range.minM);
    const large = fanAt(range.maxM);
    expect(small.arrows.map((arrow) => arrow.shape)).toEqual(large.arrows.map((arrow) => arrow.shape));
    small.arrows.forEach((arrow, k) => expect(arrow.lengthM).toBeCloseTo(large.arrows[k]!.lengthM, 6));
    expect(meanTailM([small])).toBeLessThan(meanTailM([large]) - 40);
  });

  it("pulls the fans in for a small dome and spreads them back out as the dome grows", () => {
    for (const cut of CUTS) {
      for (const triple of [[0, 1, 8], [0, 8, 9], [8, 7, 9]]) {
        const streams = streamsFrom(triple);
        const [min, auto, , max] = radii(cut);
        const label = `${cut.name} ${triple.join("/")}`;
        const atMin = layoutStreamFans(streams, siteOf(cut, min!));
        const atAuto = layoutStreamFans(streams, siteOf(cut, auto!));
        const atMax = layoutStreamFans(streams, siteOf(cut, max!));
        expect(meanTailM(atMin), label).toBeLessThan(meanTailM(atMax) - 20);
        expect(meanTailM(atAuto), label).toBeLessThan(meanTailM(atMax) - 20);
        expect(reachM(atMin), label).toBeLessThan(reachM(atMax) - 20);
        expect(reachM(atAuto), label).toBeLessThan(reachM(atMax) - 20);
      }
    }
  });

  it("fills the cut as before when the dome is off", () => {
    for (const cut of CUTS) {
      const streams = streamsFrom([0, 1, 8]);
      const plain = layoutStreamFans(streams, { halfWidthM: cut.widthM / 2, halfHeightM: cut.heightM / 2 });
      const domeOff = layoutStreamFans(streams, siteOf(cut, null));
      expect(domeOff.map((fan) => fan.band)).toEqual(plain.map((fan) => fan.band));
      domeOff.forEach((fan, i) =>
        fan.arrows.forEach((arrow, k) => expect([...arrow.positions]).toEqual([...plain[i]!.arrows[k]!.positions])),
      );
    }
  });

  it("keeps fans apart, lets a large dome carry arrows outside the cut, and fades them at the dome radius", () => {
    const poseReachM = (fans: readonly StreamFan[]) => {
      let best = 0;
      for (const fan of fans) {
        for (const arrow of fan.arrows) {
          for (const progress of [0, 0.5, 1]) {
            const pose = streamTravelPose(arrow, progress);
            for (const s of [pose.tailM, pose.tipM]) {
              const p = streamTrackPoint(arrow.track, s);
              best = Math.max(best, Math.hypot(p.east, p.north));
            }
          }
          for (let i = 0; i < arrow.positions.length; i += 2) {
            best = Math.max(best, Math.hypot(arrow.positions[i]!, arrow.positions[i + 1]!));
          }
        }
      }
      return best;
    };
    for (const cut of CUTS) {
      for (const triple of TRIPLES) {
        const streams = streamsFrom(triple);
        const open = streamFanClearanceM(layoutStreamFans(streams, siteOf(cut)));
        const maxR = sunDomeRange(cut).maxM;
        const atMax = layoutStreamFans(streams, siteOf(cut, maxR));
        const labelMax = `${cut.name} ${triple.join("/")} r=${Math.round(maxR)}`;
        expect(streamFanClearanceM(atMax), labelMax).toBeGreaterThan(Math.min(open, 0.24 * Math.min(cut.widthM, cut.heightM) / 2) * 0.6);
        const maxReach = poseReachM(atMax);
        expect(maxReach, labelMax).toBeGreaterThan(Math.min(cut.widthM, cut.heightM) / 2);
        expect(maxReach, labelMax).toBeLessThanOrEqual(maxR + 8);
        for (const radius of radii(cut)) {
          const fans = layoutStreamFans(streams, siteOf(cut, radius));
          const label = `${cut.name} ${triple.join("/")} r=${Math.round(radius)}`;
          expect(streamFanClearanceM(fans), label).toBeGreaterThan(Math.min(open, 0.24 * Math.min(cut.widthM, cut.heightM) / 2) * 0.5);
        }
      }
    }
  });

  it("threads the live dome radius to the 3D arrows and the Rhino still pose, and only while the dome shows", () => {
    const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
    expect(source("src/components/WindDiagramStreams.tsx")).toContain(
      "layoutStreamFans(streams, { halfWidthM, halfHeightM, spreadRadiusM })",
    );
    const hook = source("src/components/model/useModelPage.tsx");
    expect(hook).toContain(
      "const windSpreadRadiusM = solarSettingsForActiveAnalysis(solar, analyses).showPath ? sunDome.radiusM : null;",
    );
    expect(hook).toContain("windStreaksSpreadRadiusM: windSpreadRadiusM,");
    expect(source("src/components/model/ModelPageViewportTabs.tsx")).toContain("windSpreadRadiusM={windSpreadRadiusM}");
    const model = { sideM: 500, buildings: [], terrain: null } as never;
    const streams = streamsFrom([0, 1, 8]);
    const range = sunDomeRange({ sideM: 500 });
    const still = windStreakStillArrows(model, streams, range.minM);
    const onScreen = layoutStreamFans(streams, { halfWidthM: 250, halfHeightM: 250, spreadRadiusM: range.minM }).flatMap((fan) => fan.arrows);
    still.forEach((arrow, k) => expect(arrow.vertices[0]![0]).toBe(onScreen[k]!.positions[0]));
    expect(windStreakStillArrows(model, streams)[0]!.vertices).not.toEqual(still[0]!.vertices);
  });
});
