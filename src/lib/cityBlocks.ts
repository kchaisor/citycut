import polygonClipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";
import { openRing, signedArea } from "./geo";
import {
  circleRing,
  clipAreaToSiteFrame,
  DEFAULT_SITE_FRAME_SHAPE,
  siteFrameHalf,
  type SiteFrameShape,
} from "./siteFrame";
import { unionCarriageways, unionPathRoads } from "./roadFill";
import type { AreaFeat, CityModel, Pt, Ring, RoadFeat } from "../types";

type Multi = MultiPolygon;

function ringToClip(ring: Ring): Polygon[0] {
  return openRing(ring).map((p) => [p[0], p[1]] as [number, number]);
}

function multiFromRing(outer: Ring, holes: Ring[] = []): Multi {
  return [[ringToClip(outer), ...holes.map((hole) => ringToClip(hole))]];
}

function clipMultiToFrame(multi: Multi, sideM: number, frameShape: SiteFrameShape): Multi {
  const out: Multi = [];
  for (const poly of multi) {
    const outer = poly[0];
    if (!outer) continue;
    const ring: Ring = outer.map(([x, y]) => [x, y] as Pt);
    const holes: Ring[] = poly.slice(1).map((hole) => hole.map(([x, y]) => [x, y] as Pt));
    const clipped = clipAreaToSiteFrame(ring, holes, sideM, frameShape);
    if (!clipped || clipped[0]!.length < 3) continue;
    out.push([
      clipped[0]!.map((p) => [p[0], p[1]] as [number, number]),
      ...clipped.slice(1).map((hole) => hole.map((p) => [p[0], p[1]] as [number, number])),
    ]);
  }
  return out;
}

function multiToAreas(multi: Multi, startId: number): AreaFeat[] {
  const areas: AreaFeat[] = [];
  let id = startId;
  for (const poly of multi) {
    const outer = poly[0];
    if (!outer || outer.length < 4) continue;
    const ring: Ring = outer.map(([x, y]) => [x, y] as Pt);
    const a = Math.abs(signedArea(ring));
    if (a < 80) continue;
    const holes: Ring[] = poly
      .slice(1)
      .filter((hole) => hole.length >= 4)
      .map((hole) => hole.map(([x, y]) => [x, y] as Pt));
    areas.push({ id: id++, ring, holes, kind: "block" });
  }
  return areas;
}

/** Road-enclosed parcels: site frame minus carriageways/paths/rail, minus water and green. */
export function computeCityBlocks(model: Pick<CityModel, "roads" | "areas" | "sideM" | "frameShape">): AreaFeat[] {
  const sideM = model.sideM;
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const half = siteFrameHalf(sideM);
  let site: Multi =
    frameShape === "circle" ? multiFromRing(circleRing(half)) : multiFromRing(
          [
            [-half, -half],
            [half, -half],
            [half, half],
            [-half, half],
            [-half, -half],
          ],
        );

  const roads = model.roads;
  const pathFill = unionPathRoads(
    roads.filter((r) => r.kind === "road" && r.grade === "path").map((r) => ({ line: r.line, width: r.width })),
    sideM,
    frameShape,
  );
  const localFill = unionCarriageways(
    roads.filter((r) => r.kind === "road" && (r.grade ?? "local") === "local").map(roadPoly),
    sideM,
    frameShape,
  );
  const arterialFill = unionCarriageways(
    roads.filter((r) => r.kind === "road" && r.grade === "arterial").map(roadPoly),
    sideM,
    frameShape,
  );
  const railFill = unionCarriageways(
    roads.filter((r) => r.kind === "rail").map(roadPoly),
    sideM,
    frameShape,
  );

  const subtractRoads = (current: Multi, fill: { polygons: Ring[][] }): Multi => {
    if (fill.polygons.length === 0) return current;
    const roadMulti: Multi = fill.polygons.map((poly) => {
      const outer = poly[0];
      const holes = poly.slice(1);
      return [
        outer!.map((p) => [p[0], p[1]] as [number, number]),
        ...holes.map((hole) => hole.map((p) => [p[0], p[1]] as [number, number])),
      ];
    });
    const diff = polygonClipping.difference(current, roadMulti);
    return (Array.isArray(diff) ? diff : []) as Multi;
  };

  site = subtractRoads(site, pathFill);
  site = subtractRoads(site, localFill);
  site = subtractRoads(site, arterialFill);
  site = subtractRoads(site, railFill);

  for (const area of model.areas) {
    if (area.kind === "block") continue;
    const patch = multiFromRing(area.ring, area.holes);
    const diff = polygonClipping.difference(site, patch);
    site = (Array.isArray(diff) ? diff : []) as Multi;
  }

  site = clipMultiToFrame(site, sideM, frameShape);
  return multiToAreas(site, 1);
}

function roadPoly(road: RoadFeat) {
  return { line: road.line, width: road.width };
}
