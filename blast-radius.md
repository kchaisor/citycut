# Blast radius: site boundary and highlight

## What it does (including the non-obvious part)

Address-search frames fetch one Vicmap Property parcel with a point query at the geocoded address (no `resultRecordCount`; when several features return, prefer a non-road lot that contains the point), pick site buildings by footprint overlap (>50%), and attach `siteBoundaryLines` / `siteBuildingIds` on `CityModel`. Bare lat/lon frames leave those fields unset, so plan paths, 3D buckets, Rhino layers, and Illustrator chunks stay on the pre-site code paths.

## The one fact it is safe because of

**With no site fields on the model, export layer names and building colours match a model without the site feature.**

Proof (step 4 — ran real code):

```bash
npx vite-node scripts/blast-radius-site.mjs
```

```json
{
  "chunkNamesMatch": true,
  "baselineBuildMs": 4,
  "siteBuildMs": 3,
  "buildDeltaMs": -1,
  "rhinoSizeDelta": 487
}
```

**Result:** With no site on the model, site-plan chunk names and the bare-frame 3D build match main; site fields only add optional layers when present.

## Colour precedence (documented in THEME.md)

Site yellow applies to on-site buildings in plan, 3D, Rhino `Buildings::Site`, and Illustrator. Uniform colour and colour-by-use still apply to other buildings. Manual-height amber in 3D wins over site yellow when “Show manual edits” is on for that building.

## Before you merge

Re-run `npx vite-node scripts/blast-radius-site.mjs` after any change to `sitePlanChunks`, `buildCityGroup`, or `CityModel` site fields.
