import { readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { COLOUR_FALLBACK, getColour } from "./colours";
import { applySolarGreyscale } from "./solarGreyscale";
import { SECTOR_LABELS, downwindFromSector } from "./windRose";
import {
  STREAM_INDICES_PER_ARROW,
  STREAM_RENDER_ORDER,
  STREAM_VERTS_PER_ARROW,
  createStreamFanMesh,
  layoutStreamFans,
  streamAlpha,
  streamArrowCount,
  streamFanClearanceM,
  streamPlaneHeightM,
  tintStreamFanMesh,
  writeStreamAlphas,
  type StreamArrow,
} from "./windDiagramStreams";
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

  it("travels a soft pulse along the arrows and holds still when the clock is paused", () => {
    const fan = fans[0]!;
    const mesh = createStreamFanMesh(fan, 0);
    const at = (seconds: number) => {
      writeStreamAlphas(fan, seconds, mesh.userData.colours);
      return Array.from({ length: mesh.userData.colours.length / 4 }, (_, i) => mesh.userData.colours[i * 4 + 3]!);
    };
    const start = at(1);
    expect(at(1)).toEqual(start);
    expect(at(2.2)).not.toEqual(start);
    for (const alpha of start) {
      expect(alpha).toBeGreaterThan(0.3);
      expect(alpha).toBeLessThanOrEqual(1);
    }
    expect(streamAlpha(0.9, 0, 0)).toBeGreaterThan(streamAlpha(0.02, 0, 0));
    for (let i = 0; i < mesh.userData.colours.length; i += 4) {
      expect([mesh.userData.colours[i], mesh.userData.colours[i + 1], mesh.userData.colours[i + 2]]).toEqual([1, 1, 1]);
    }
  });
});
