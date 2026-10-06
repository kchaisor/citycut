# Blast radius: manual building heights

## What it does (including the non-obvious part)

Click-to-set height stores overrides in `localStorage` (`heightOverrides.ts`), matches them back onto buildings after the CoM worker pass in `ModelPage.tsx`, and sets `heightManual` while clearing `heightFromFallback` and `extrusionParts`. Every consumer reads the same `displayModel.buildings` array. Plan-shadow union caching now keys on `buildingHeightsFingerprint()` so height edits invalidate cached unions without a full reload.

## Readers of `building.height` / `extrusionParts`

| Area | File | Notes |
|------|------|--------|
| 3D extrusion | `src/lib/buildCity.ts` | `extrudeFootprint` uses parts or single height |
| 3D framing | `src/components/Scene3D.tsx` | `siteTopY` from `building.height` |
| Plan shadows | `src/lib/buildingShadows.ts` | `building.height` for offset and cache key |
| Site / view AI | `src/lib/aiView.ts` | Wall extrusion top from `building.height` |
| CoM clip | `src/lib/comBuildingHeightsMatch.ts` | Writes `extrusionParts`; overridden after worker |
| Zone fallback | `src/lib/useCascade.ts` | Scales part heights when zone changes |
| Overture ingest | `src/lib/overtureBuildings.ts` | Initial `extrusionParts` for min_height |
| Dedupe score | `src/lib/footprints.ts` | Sort key only |
| CoM stats | `src/lib/comBuildingHeightsCount.ts` | Compares before/after CoM |
| UI popover | `src/components/BuildingHeightPopover.tsx` | Displays current height |

## The one fact it is safe because of

**With zero overrides stored, building heights and mesh bounds are unchanged from the pre-override pipeline.**

Proof (step 4 — ran real code):

```bash
npx vite-node scripts/blast-radius-manual-heights.mjs
```

```json
{
  "fingerprintMatch": true,
  "meshBoundsMatch": true,
  "baselineBuildMs": 5,
  "withOverridePipelineBuildMs": 2,
  "deltaMs": -4
}
```

Vitest: `heightOverrides blast radius (zero overrides)` in `src/lib/heightOverrides.test.ts` (fingerprint + `buildCityGroup` AABB).

Note: `.3dm` bytes are not stable run-to-run (Rhino object ids inside `rhino3dm`); geometry is compared via Three.js bounds instead.

## CBD frame build-time delta

```bash
npx vite-node scripts/bench-height-overrides-cbd.mjs
```

```json
{
  "frame": "CBD 0.6 km",
  "buildings": 448,
  "applyOverridesEmptyStoreAvgMs": 0
}
```

## Risks

| Risk | Likelihood | Severity | Mitigation |
|------|------------|----------|------------|
| Wrong building matched by centroid fallback | Low | Medium | Overture/OSM ids tried first; 2 m / 15% area gate |
| Merged mesh pick misses face group | Low | Low | `buildingIdByGroup` + split manual tint meshes |
| Shadow cache stale after edit | Low | Medium | Fingerprint in union cache key + `clearPlanShadowCache` on override apply |

## Cleared

- Empty override store returns same building objects/heights (unit tests).
- Green/water merges still use `useGroups: false` unless tracking building ids (no export drift).
- Export credits append manual count only when `manualHeightEditCount > 0`.

## Before merge

Run `npm test` and click-set a known CBD footprint at 120 m; confirm amber tint, drawer count, and Rhino top Z.
