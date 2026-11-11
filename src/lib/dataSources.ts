import type { CityModel } from "../types";
import { NSW_BUILDING_ESTIMATE_NOTE } from "./sources/registry";
import { TFNSW_KEY_NOTE } from "./nswTransport";

const NSW_DECODED_ROWS = new Set(["nsw-lots", "nsw-easements", "nsw-road-corridors", "nsw-railways", "nsw-building-complexes"]);

import type { ComBuildingHeightsStatus } from "./comBuildingHeightsStatus";
import { treeTierCounts } from "./trees";
import { estimatedIslandCount, ROUNDABOUT_ISLAND_ESTIMATE_NOTE } from "./roundabouts";

export type DataSourceStatus = "ok" | "loading" | "failed" | "partial" | "idle";

export type DataSourceRow = {
  id: string;
  label: string;
  status: DataSourceStatus;
  detail: string;
  notes: string[];
  retry?: "com-heights";
};

export type DataSourceInput = {
  model: CityModel;
  comHeights: ComBuildingHeightsStatus;
  comMeasuredCount: number;
  comError: string | null;
};

const STATUS_WORD: Record<DataSourceStatus, string> = {
  ok: "Loaded",
  loading: "Loading",
  failed: "Failed",
  partial: "Partial",
  idle: "Not used",
};

export function dataSourceStatusWord(status: DataSourceStatus): string {
  return STATUS_WORD[status];
}

function count(value: number, one: string, many = `${one}s`): string {
  return `${value.toLocaleString()} ${value === 1 ? one : many}`;
}

export function overtureReleaseFromNote(note: string): string | null {
  const match = /Overture Maps \(([^)]+)\)/.exec(note);
  return match ? match[1]!.trim() : null;
}

export function buildDataSources({ model, comHeights, comMeasuredCount, comError }: DataSourceInput): DataSourceRow[] {
  const rows: DataSourceRow[] = [];
  const failures = model.useTierFailures ?? [];
  const warnings = model.heightSourceLoadWarnings ?? [];
  const treeNotes = model.treeLoadNotes ?? [];
  const treeNotesFor = (source: string) => treeNotes.filter((note) => note.source === source).map((n) => n.message);

  const release = overtureReleaseFromNote(model.sourceNote);
  const overtureBits = [
    model.layers.buildings ? count(model.buildings.length, "building") : null,
  ].filter(Boolean);
  const baseNotes = treeNotesFor("base");
  rows.push({
    id: "overture",
    label: "Overture Maps",
    status: baseNotes.length > 0 ? "partial" : "ok",
    detail: [release ? `Release ${release}` : null, overtureBits.join(", ") || null].filter(Boolean).join(" · "),
    notes: baseNotes,
  });

  if (model.layers.buildings && comHeights !== "outside") {
    const row: DataSourceRow = {
      id: "com-heights",
      label: "City of Melbourne heights",
      status: comHeights === "on" ? "ok" : comHeights,
      detail:
        comHeights === "on"
          ? `2023 footprints · ${count(comMeasuredCount, "building")} measured`
          : comHeights === "loading"
            ? "2023 footprints · loading"
            : "2023 footprints · heights use the next source",
      notes: comHeights === "failed" && comError ? [comError] : [],
    };
    if (comHeights === "failed") row.retry = "com-heights";
    rows.push(row);

    const damWarning = warnings.find((line) => line.includes("development floor"));
    rows.push({
      id: "com-dam",
      label: "CoM development floors",
      status: damWarning ? "failed" : "ok",
      detail: damWarning ? "Records did not load" : count(model.developmentDamRecords?.length ?? 0, "record"),
      notes: damWarning ? [damWarning] : [],
    });
  }

  if (model.layers.buildings) {
    const tileFailure = failures.find((failure) => failure.id === "enrichment_tiles_fetch");
    rows.push({
      id: "enrichment",
      label: "Building use tiles",
      status: model.enrichmentTilesFailed || tileFailure ? "failed" : "ok",
      detail:
        model.enrichmentTilesFailed || tileFailure
          ? "Live Vicmap zones used instead"
          : "Overture class, CoM CLUE, Vicmap zones",
      notes: tileFailure ? [tileFailure.message] : [],
    });

    const zoneFailures = failures.filter(
      (failure) => failure.tier === "zone" || failure.id === "enrichment_zones_wfs_incomplete",
    );
    if (zoneFailures.length > 0) {
      rows.push({
        id: "zones",
        label: "Vicmap planning zones",
        status: zoneFailures.some((failure) => failure.tier === "zone") ? "failed" : "partial",
        detail: "Some buildings may show as unclassified",
        notes: zoneFailures.map((failure) => failure.message),
      });
    }

    const coverage = failures.find((failure) => failure.tier === "enrichment_coverage");
    if (coverage) {
      rows.push({
        id: "coverage",
        label: "Building use coverage",
        status: "partial",
        detail: "Cut is outside the baked tiles",
        notes: [coverage.message],
      });
    }

    if (model.lidarHeightTierNote) {
      rows.push({
        id: "lidar",
        label: "LiDAR (Vicmap, licensed)",
        status: "idle",
        detail: model.lidarHeightTierNote,
        notes: [],
      });
    }
  }

  if (model.terrain || model.terrainError) {
    rows.push(
      model.terrain
        ? {
            id: "terrain",
            label: "Terrain",
            status: "ok",
            detail:
              model.terrain.source === "Vicmap metro contours" || (model.region === "nsw" && /contours/i.test(model.terrain.source))
                ? `${model.terrain.source} · ${model.terrain.spacingM.toFixed(1)} m grid`
                : `${model.terrain.source} · z${model.terrain.zoom} · ${model.terrain.metresPerPixel.toFixed(1)} m/px`,
            notes: model.terrainNotice ? [model.terrainNotice] : [],
          }
        : {
            id: "terrain",
            label: "Terrain",
            status: "failed",
            detail: "Flat ground used",
            notes: model.terrainError ? [model.terrainError] : [],
          },
    );
  }

  if (model.contourLayer) {
    const notes = model.contourLayer.notes ?? [];
    rows.push({
      id: "contours",
      label: "Contours",
      status: notes.length > 0 ? "partial" : "ok",
      detail: `${model.contourLayer.label} · every ${model.contourLayer.interval} m`,
      notes,
    });
  }

  if (model.region === "nsw") rows.push(...nswDataSourceRows(model));

  const estimatedIslands = estimatedIslandCount(model.areas);
  if (estimatedIslands > 0) {
    rows.push({
      id: "roundabout-islands",
      label: "Roundabout islands (estimate)",
      status: "ok",
      detail: `${estimatedIslands} estimated`,
      notes: [ROUNDABOUT_ISLAND_ESTIMATE_NOTE],
    });
  }

  if (model.layers.trees) {
    const source = model.treeSource;
    if (source?.kind === "prebake") {
      rows.push({
        id: "trees-file",
        label: "Pre-baked tree file",
        status: "ok",
        detail: [
          source.builtAt ? `Built ${source.builtAt}` : null,
          source.vicmapDate ? `Vicmap data ${source.vicmapDate}` : null,
          source.comDate ? `CoM data ${source.comDate}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        notes: [],
      });
    } else if (source?.kind === "live") {
      rows.push({
        id: "trees-file",
        label: "Pre-baked tree file",
        status: "failed",
        detail: "Live servers used (backup)",
        notes: treeNotesFor("prebake"),
      });
    }
    const tiers = treeTierCounts(model.trees);
    const treeRow = (id: "com" | "osm" | "vicmap", label: string, noteSource: "com" | "vicmap" | "base") => {
      const notes = treeNotesFor(noteSource);
      const n = tiers[id];
      rows.push({
        id: `trees-${id}`,
        label,
        status: notes.length > 0 ? (n > 0 ? "partial" : "failed") : n > 0 ? "ok" : "idle",
        detail: n > 0 ? count(n, "tree") : notes.length > 0 ? "Tier missing" : "None in this frame",
        notes,
      });
    };
    treeRow("com", "City of Melbourne trees", "com");
    treeRow("osm", "OpenStreetMap trees", "base");
    treeRow("vicmap", "Vicmap trees", "vicmap");
  }

  if (model.layers.roads && (model.tramLinesLoadFailed || (model.tramLines?.length ?? 0) > 0)) {
    rows.push(
      model.tramLinesLoadFailed
        ? {
            id: "trams",
            label: "PTV tram routes",
            status: "failed",
            detail: "Trams not drawn",
            notes: ["PTV tram routes failed to load."],
          }
        : {
            id: "trams",
            label: "PTV tram routes",
            status: "ok",
            detail: count(model.tramLines!.length, "line"),
            notes: [],
          },
    );
  }

  if (model.siteAnchor) {
    rows.push(
      model.siteParcelPfi
        ? {
            id: "parcel",
            label: "Vicmap property parcel",
            status: "ok",
            detail: `PFI ${model.siteParcelPfi}${model.siteParcelSpi ? ` · SPI ${model.siteParcelSpi}` : ""}`,
            notes: [],
          }
        : {
            id: "parcel",
            label: "Vicmap property parcel",
            status: "failed",
            detail: "Site boundary not drawn",
            notes: model.siteNote ? [model.siteNote] : [],
          },
    );
  }

  if (model.region === "nsw") return nswOnlyRows(model, rows);
  return rows;
}

const VIC_ONLY_ROWS = new Set(["com-heights", "com-dam", "enrichment", "zones", "coverage", "lidar", "trees-com", "trees-vicmap", "trams", "parcel"]);

function nswOnlyRows(model: CityModel, rows: DataSourceRow[]): DataSourceRow[] {
  const kept = rows.filter((row) => !VIC_ONLY_ROWS.has(row.id));
  if (model.layers.buildings) {
    kept.splice(1, 0, {
      id: "nsw-building-use",
      label: "Building use",
      status: "ok",
      detail:
        (model.nswUseMatched ?? 0) > 0
          ? `NSW Spatial Services building complexes for ${count(model.nswUseMatched ?? 0, "building")}; Overture class for the rest`
          : "Overture building class (no NSW building complex in this cut)",
      notes: [],
    });
  }
  return kept;
}

export function nswDataSourceRows(model: CityModel): DataSourceRow[] {
  const rows: DataSourceRow[] = [];
  if (!model.nsw) {
    rows.push({ id: "nsw", label: "NSW Spatial Services and planning layers", status: "failed", detail: "NSW layers did not load", notes: [] });
    return rows;
  }
  for (const layer of Object.values(model.nsw.status)) {
    rows.push({
      id: layer.id,
      label: layer.label,
      status: layer.status,
      detail:
        layer.status === "failed"
          ? "Not drawn"
          : `${count(layer.count, "feature")} · ${(layer.ms / 1000).toFixed(1)} s${layer.pages > 1 ? ` · ${layer.pages} pages` : ""}${
              layer.retries > 0 ? ` · ${count(layer.retries, "retry", "retries")}` : ""
            }${NSW_DECODED_ROWS.has(layer.id) ? " · codes decoded" : ""}`,
      notes: layer.note ? [layer.note] : [],
    });
  }
  for (const note of model.nsw.codeNotes) {
    const prefix = note.split(":")[0]!;
    const row = rows.find((item) => item.label.startsWith(prefix));
    (row ?? rows[0])!.notes.push(note);
  }
  rows.push({
    id: "nsw-datum",
    label: "NSW datum",
    status: "ok",
    detail: "GDA2020: Spatial Services through the official NTv2 grid (server); planning layers and City of Sydney contours through EPSG:8048",
    notes: [],
  });
  if (model.nswRoadSurface) {
    const { nswCorridorM2, overtureM2 } = model.nswRoadSurface;
    const total = nswCorridorM2 + overtureM2;
    const share = (m2: number) => (total > 0 ? Math.round((m2 / total) * 100) : 0);
    rows.push({
      id: "nsw-road-surface",
      label: "Road surfaces",
      status: "ok",
      detail: `NSW road corridors ${share(nswCorridorM2)}% · Overture carriageways ${share(overtureM2)}%`,
      notes: [],
    });
  }
  rows.push({
    id: "nsw-public-transport",
    label: "Public transport stops",
    status: "ok",
    detail: "NSW stations and light rail stops; OSM bus stops (exploded axo)",
    notes: [TFNSW_KEY_NOTE],
  });
  if (model.nswWaterNote) {
    const water = rows.find((row) => row.id === "nsw-water");
    if (water && !water.notes.includes(model.nswWaterNote)) water.notes.push(model.nswWaterNote);
  }
  if (model.layers.buildings) {
    rows.push({
      id: "nsw-building-heights",
      label: "Building heights (estimate)",
      status: "partial",
      detail: "Overture/OSM height, floors × 3 m, or default",
      notes: [NSW_BUILDING_ESTIMATE_NOTE],
    });
  }
  return rows;
}

export function countLoaded(rows: readonly DataSourceRow[]): { loaded: number; total: number } {
  const counted = rows.filter((row) => row.status !== "idle");
  return { loaded: counted.filter((row) => row.status === "ok").length, total: counted.length };
}
