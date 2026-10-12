import type { CityModel } from "../types";
import type { ComBuildingHeightsStatus } from "./comBuildingHeightsStatus";
import { treeTierCounts } from "./trees";

/**
 * The data-source list in Model details. Every row is read from the model and the
 * live CoM state; nothing here is invented. A failed source keeps its note.
 */
export type DataSourceStatus = "ok" | "loading" | "failed" | "partial" | "idle";

export type DataSourceRow = {
  id: string;
  label: string;
  status: DataSourceStatus;
  /** One short line under the label. */
  detail: string;
  /** Failure or coverage notes, shown in full. */
  notes: string[];
  /** Offer the CoM heights Retry (#81) on this row. */
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

/** The Overture release named in the source note, for example "2025-09-24.0". */
export function overtureReleaseFromNote(note: string): string | null {
  const match = /Overture Maps \(([^)]+)\)/.exec(note);
  return match ? match[1]!.trim() : null;
}

export function buildDataSources({ model, comHeights, comMeasuredCount, comError }: DataSourceInput): DataSourceRow[] {
  const rows: DataSourceRow[] = [];
  const failures = model.useTierFailures ?? [];
  const warnings = model.heightSourceLoadWarnings ?? [];
  // Tree-source notes from #88: "base" is the Overture base tile, "com" and "vicmap" the tree tiers.
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
    const bca = failures.find((failure) => failure.id === "enrichment_bca_blocked");
    rows.push({
      id: "enrichment",
      label: "Building use tiles",
      status: model.enrichmentTilesFailed || tileFailure ? "failed" : "ok",
      detail:
        model.enrichmentTilesFailed || tileFailure
          ? "Live Vicmap zones used instead"
          : bca
            ? "Overture class, CoM CLUE, Vicmap zones"
            : "Overture class, CoM CLUE, BCA, Vicmap zones",
      notes: tileFailure ? [tileFailure.message] : [],
    });

    if (bca) {
      rows.push({
        id: "bca",
        label: "Building permits (BCA)",
        status: "failed",
        detail: "Permit use classes are missing",
        notes: [bca.message],
      });
    }

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
            detail: `${model.terrain.source} · z${model.terrain.zoom} · ${model.terrain.metresPerPixel.toFixed(1)} m/px`,
            notes: [],
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
    rows.push({
      id: "contours",
      label: "Contours",
      status: "ok",
      detail: `${model.contourLayer.label} · every ${model.contourLayer.interval} m`,
      notes: [],
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
    // OpenStreetMap tree points come from the Overture base tile, so a base failure shows here too.
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

  return rows;
}

export function countLoaded(rows: readonly DataSourceRow[]): { loaded: number; total: number } {
  const counted = rows.filter((row) => row.status !== "idle");
  return { loaded: counted.filter((row) => row.status === "ok").length, total: counted.length };
}
