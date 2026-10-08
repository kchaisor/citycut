import { describe, expect, it, vi } from "vitest";
import {
  defaultLidarManifestEntry,
  LIDAR_NO_DATA_LINE,
  LIDAR_STATUS_NO_DATA,
  lidarLegendLine,
  logLidarEnrichmentStatus,
} from "./lidarTierStatus";

describe("lidarTierStatus", () => {
  it("uses explicit no-data manifest entry", () => {
    expect(defaultLidarManifestEntry()).toEqual({
      status: LIDAR_STATUS_NO_DATA,
      detail: LIDAR_NO_DATA_LINE,
    });
  });

  it("logs the CI line", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logLidarEnrichmentStatus({ lidar: defaultLidarManifestEntry() } as import("./buildingEnrichmentTiles").EnrichmentManifest);
    expect(info).toHaveBeenCalledWith(`[CityCut enrichment] ${LIDAR_NO_DATA_LINE}`);
    info.mockRestore();
  });

  it("falls back when manifest lidar is missing", () => {
    expect(lidarLegendLine(null)).toBe(LIDAR_NO_DATA_LINE);
  });
});
