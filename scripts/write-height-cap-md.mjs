import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("/opt/cursor/artifacts/height-cap-data.json", "utf8"));
const man = data.find((f) => f.label === "Mont Albert North");
const cbd = data.find((f) => f.label === "Melbourne CBD");

function fmtStats(s) {
  if (!s) return "—";
  return `n=${s.count}, min=${s.min?.toFixed?.(2) ?? s.min}, p50=${s.p50?.toFixed?.(2) ?? s.p50}, p90=${s.p90?.toFixed?.(2) ?? s.p90}, max=${s.max?.toFixed?.(2) ?? s.max}, >9=${s.over9}, >12=${s.over12}, >15=${s.over15}`;
}

function capTable(frame) {
  const modes = ["ml_footprint_only", "non_osm_height", "all_overture"];
  let out = "| Cap mode | Total touched | By zone | By source |\n|---|---:|---|---|\n";
  for (const mode of modes) {
    const row = frame.capImpact[mode];
    out += `| ${mode} | ${row.total} | ${JSON.stringify(row.byZone)} | ${JSON.stringify(row.bySource)} |\n`;
  }
  return out;
}

function tallestTable(list) {
  if (!list.length) return "_None in frame._\n";
  let out = "| Height (m) | Method | Source datasets | Area (m²) | Lat | Lon |\n|---:|---|---|---:|---:|---:|\n";
  for (const row of list) {
    out += `| ${row.height.toFixed(2)} | ${row.heightMethod} | ${row.sourceDatasets.join(", ")} | ${row.footprintAreaM2} | ${row.lat.toFixed(5)} | ${row.lon.toFixed(5)} |\n`;
  }
  return out;
}

const md = `# Height cap scope study

Analysis date: 2026-10-05 (UTC). Overture release: **${man.overtureRelease}**. Frames are **1 km** squares using the same PMTiles fetch path as the app (\`fetchOvertureBuildingRecordsForCut\` → zone refinement via \`assignExternalUses\` on \`main\` including PR #44 zone fallbacks).

## Executive summary

**Mont Albert North** (\`${man.center.lat}, ${man.center.lon}\`): **1,142** buildings. **No extrusion exceeds 9 m** (max **8.52 m**). Heights come almost entirely from Overture \`height\` on **Microsoft ML Buildings** footprints (median ~4.8–4.9 m in NRZ/GRZ), not from zone fallback. With the proposed zone caps below, **zero buildings would change** in this frame (all cap modes).

**Melbourne CBD** (\`${cbd.center.lat}, ${cbd.center.lon}\`): **926** buildings, **CCZ** core. Proposed caps leave **CCZ uncapped**; only **3** PUZ buildings would be trimmed under an \"cap all Overture heights\" policy (15 m → 9 m cap). **No CBD towers** in CCZ are touched.

**Recommendation:** Zone-based caps are **low value for Mont Albert North specifically** because Overture ML heights are already single-/double-storey scale. PR #44 already reduced missing-height massing. A cap feature would mainly help **other frames** where \`num_floors\` or inflated \`height\` tags appear on residential zones; scope it to **ML-only footprints and/or non-OSM height** rather than OSM-surveyed CBD tags. **Effort is modest** (~1–2 files production + tests) but **ROI is uncertain** until a suburb with high ML/\`num_floors\` outliers is identified.

---

## 1. Per-building height lineage (Mont Albert North)

Full row-level export: \`/opt/cursor/artifacts/height-cap-man-buildings.jsonl\` (**${man.buildingCount}** lines).

| Field | Description |
|---|---|
| \`heightMethod\` | \`height\` (Overture \`height\`), \`num_floors\` (× 3 m), or \`fallback\` (zone/shed default after PR #44) |
| \`sourceDatasets\` | Parsed Overture \`sources\` entries (\`provider/dataset\`) |
| \`zoneNorm\` | Normalised Vicmap \`zone_code\` at footprint centroid |

**Height method counts:** ${JSON.stringify(man.heightMethodCounts)}

**Source dataset mix:**

| Datasets | Count |
|---|---:|
| microsoft/Microsoft ML Buildings | 1085 |
| osm/OpenStreetMap | 25 |
| microsoft/Microsoft ML Buildings + osm/OpenStreetMap | 32 |

**Zones present:** ${Object.keys(man.distributions.byZone).sort().join(", ")}

---

## 2. Height distributions

### Mont Albert North — by zone

| Zone | Distribution |
|---|---|
| NRZ | ${fmtStats(man.distributions.byZone.NRZ)} |
| GRZ | ${fmtStats(man.distributions.byZone.GRZ)} |
| C1Z | ${fmtStats(man.distributions.byZone.C1Z)} |
| PPRZ | ${fmtStats(man.distributions.byZone.PPRZ)} |

### Mont Albert North — by source bucket

| Bucket | Stats |
|---|---|
| microsoft_ml | ${fmtStats(man.distributions.bySource.microsoft_ml)} |
| osm | ${fmtStats(man.distributions.bySource.osm)} |

### Melbourne CBD — by zone (sanity)

| Zone | Stats |
|---|---|
| CCZ | ${fmtStats(cbd.distributions.byZone.CCZ)} |
| PUZ | ${fmtStats(cbd.distributions.byZone.PUZ)} |

### Melbourne CBD — by source bucket

| osm | ${fmtStats(cbd.distributions.bySource.osm)} |
| other | ${fmtStats(cbd.distributions.bySource.other)} |

CBD height methods: ${JSON.stringify(cbd.heightMethodCounts)} (\`num_floors\` drives many mid-rise extrusions where OSM lacks \`height\`).

---

## 3. Ten tallest in NRZ and GRZ (Mont Albert North)

### NRZ

${tallestTable(man.tallestNRZ)}

### GRZ

${tallestTable(man.tallestGRZ)}

These are **Microsoft ML \`height\` estimates** on detached-house footprints (roughly 6–8.5 m). Nothing suggests apartment towers or bad fallback stacking.

---

## 4. Proposed zone caps and impact

Caps (\`null\` = no limit) used for counting:

\`\`\`json
${JSON.stringify(man.proposedCaps, null, 2)}
\`\`\`

Unlisted zones default to **11 m** in the counter script (conservative inner-suburban belt).

### Mont Albert North — buildings that would change

${capTable(man)}

### Melbourne CBD — buildings that would change

${capTable(cbd)}

---

## 5. Cap policy: ML only vs all Overture heights

| Policy | Mont Albert North | Melbourne CBD | Notes |
|---|---:|---:|---|
| \`ml_footprint_only\` | 0 | 0 | ML footprints dominate Mont Albert but **heights are already ≤ 8.5 m** |
| \`non_osm_height\` | 0 | 0 | Same here: no cap-eligible row exceeds zone cap |
| \`all_overture\` | 0 | 3 | CBD trims only **PUZ** stock at 15 m; **CCZ towers (OSM \`height\`) untouched** |

**Evidence:** In Mont Albert, **1,044 / 1,142** buildings use Overture \`height\`; **98** use zone fallback (max **8 m** after PR #44). Capping OSM-tagged CBD heights would require \`all_overture\` and still misses **253 m** Rialto-class tags because **CCZ cap is null**.

Prefer **\`ml_footprint_only\` or \`non_osm_height\`** if the feature is built, so surveyed OSM \`height\` in the CBD is never clipped.

---

## 6. CBD sanity check

Tallest CCZ examples (unchanged under proposed caps): heights **253, 217.5, 211, …** m with \`osm/OpenStreetMap\` sources and \`height\` method.

Cap impact: **0** CCZ rows in every mode; **3** rows in PUZ under \`all_overture\` only.

---

## 7. Implementation effort (if pursued)

| Area | Files | Tests | Risk |
|---|---|---|---|
| Zone cap map + apply after zone fallback | \`src/lib/buildingHeightCap.ts\` (new), \`src/lib/useCascade.ts\` or \`overtureBuildings.ts\` hook | Unit tests for cap table, ML-only guard, CCZ null | Wrong cap table could flatten genuine mid-rise in C2Z/C3Z; mitigate with \`null\` caps for CCZ/CDZ/RGZ/MUZ/ACZ/C1Z |
| Source-aware policy | \`src/lib/overtureSources.ts\` (extend) | Existing Overture source parse tests | Mis-classifying mixed OSM+ML footprints |
| UI / docs | \`README.md\`, optional toggle | \`model.test.ts\` snapshot of height note | Low |
| **Total** | ~4–5 TS files, no CSS unless surfacing a control | 2–3 test files | **Medium** policy risk, **low** technical risk |

---

## 8. Preview (Mont Albert North)

Proposed caps alter **no** extrusions in this frame; before/after captures are **visually the same** (see artifact note on images).

---

## Artifacts

| Path | Contents |
|---|---|
| \`/opt/cursor/artifacts/height-cap-scope.md\` | This report |
| \`/opt/cursor/artifacts/height-cap-data.json\` | Full structured results (both frames, all rows) |
| \`/opt/cursor/artifacts/height-cap-man-buildings.jsonl\` | One JSON object per building, Mont Albert North |
| \`/opt/cursor/artifacts/cap-before.png\` | 3D preview before caps |
| \`/opt/cursor/artifacts/cap-after.png\` | 3D preview after caps (no mesh change expected) |
`;

fs.writeFileSync("/opt/cursor/artifacts/height-cap-scope.md", md);

const jsonl = man.rows
  .map((row) =>
    JSON.stringify({
      overtureId: row.overtureId,
      height_m: row.height,
      heightMethod: row.heightMethod,
      sourceDatasets: row.sourceDatasets,
      geometrySource: row.geometrySource,
      sourceBucket: row.sourceBucket,
      zoneCode: row.zoneCode,
      zoneNorm: row.zoneNorm,
      footprintAreaM2: row.footprintAreaM2,
      lat: row.lat,
      lon: row.lon,
      osmWayIds: row.osmWayIds,
    }),
  )
  .join("\n");
fs.writeFileSync("/opt/cursor/artifacts/height-cap-man-buildings.jsonl", jsonl + "\n");
console.log("wrote md + jsonl");
