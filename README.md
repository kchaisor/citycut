# CityCut

CityCut cuts a square out of a city and exports it as a 3D model and a 2D site plan. The default view opens on the Melbourne CBD.

It is a study tool for early architectural work: OpenStreetMap footprints, estimated heights, and a terrain heightfield. It is not a survey. Turn Terrain off and the ground is a flat surface.

## Live site

The production build is set up to publish to [https://kchaisor.github.io/citycut-export/](https://kchaisor.github.io/citycut-export/).

Pushes to `main` build `dist` and deploy it with GitHub Actions (`.github/workflows/pages.yml`). Vite’s `base` is `/citycut-export/`, so the built HTML, scripts, styles, and favicon resolve under that project path. The app has no client-side router, so there is no extra basename to set.

GitHub Pages still needs **Settings → Pages → Source: GitHub Actions** turned on once for this repo (the site source is not enabled yet). After that, the address above is the live app.

## Pipeline

1. **Choose a block.** A MapLibre map fills the screen. A fixed frame stays centered while you pan and zoom. The frame is a true square on the ground, from 0.25 km to 1.4 km on a side (about 2 km² at the top of the slider).
2. **Search.** Nominatim pans the map to a place. The frame still marks the area that will be exported.
3. **Choose layers.** Buildings, roads and rail, water and green, and terrain are on by default. Buildings, roads, water, and green are sent to Overpass. Trees is off until you turn it on. It then places four vector tiers, deduplicated, as instanced archetype silhouettes: City of Melbourne urban-forest trees, OpenStreetMap `natural=tree` and `natural=tree_row`, Vicmap Vegetation Tree Urban points, and a canopy infill of `natural=wood`, `landuse=forest`, and `natural=scrub`. Contours is on by default. Inside Victoria the lines are Vicmap Elevation: the metro 1–5 m contours where that layer has features, otherwise the statewide 1:25,000 10 m contours. If that service fails or the frame is outside Victoria, the site plan keeps the lines marched from the terrain. Satellite image only switches the basemap.
4. **Create model.** CityCut queries Overpass for that bounding box, clips every feature to the square, and opens the result. Tree tiers, Vicmap contours, and the terrain are fetched in parallel. Trees, when that layer is on, are drawn as instanced massing forms rather than one mesh per tree. Terrain, when that layer is on, fetches Mapterhorn tiles for the square and builds a heightfield in the same local metre frame. The 3D terrain mesh stays that heightfield.

5. **Review.** Three views of the same block:
   - **3D model** — extruded footprints in the browser (Three.js)
   - **Drawing** — SVG site plan, pan and zoom
   - **Satellite** — Esri imagery of the frame, preview only
6. **Download.** glTF binary (`.glb`), Rhino (`.3dm`), and SVG. DXF, DAE, and JPG are not offered.

Building height, in order:

- OSM `height` (feet are converted to meters)
- otherwise `building:levels` × 3 m
- otherwise 9 m

Building colour follows a cascade, stopping at the first match: OSM tags already on the building (`building`, `building:use`, and amenity, shop, office, or landuse on that element), then Vicmap planning zones. Anything left is unclassified. Categories are residential, commercial, retail, mixed use, industrial, civic, recreation, outbuilding, and unclassified. The 3D view counts each category and each source tier, and can recolour by source so a zone guess is hatched and lighter than an observed OSM tag. A uniform off-white is still available. glTF keeps one material per category. The Rhino file puts each category on a sublayer such as `Buildings::Residential`, and each building object stores `use` and `typology_source` (`osm_tag`, `zone`, or `none`). A frame can open on `?lat=&lon=&km=`.

Roads are asphalt, `#3a3a3a`, with local streets and footways a step lighter. The ribbon faces upward whichever way the OSM way was drawn. On a heightfield it is split so a long run follows the surface, and it sits a few centimetres above the terrain, parks, and water. Roads do not use a depth bias: a large one clips the ribbon when the camera is low, and the street disappears.

Heights are capped between 3 m and 420 m. With Terrain off, the ground is a flat surface and exports match that flat model. With Terrain on, buildings are extruded from the lowest DEM sample on the footprint, trees sit on the sample at the trunk, and roads, rail, parks, and water are draped a few centimetres above the surface. Multipolygon buildings, parks, and water bodies are stitched when the relation is small enough to assemble (80 members or fewer).

## Terrain

Terrain is on by default. The tiles are [Mapterhorn](https://mapterhorn.com/) Terrarium WebP, 512 px, from `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp` ([TileJSON](https://tiles.mapterhorn.com/tilejson.json), `encoding: terrarium`). Height is `R * 256 + G + B / 256 − 32768` metres. The host sends `Access-Control-Allow-Origin: *`. The TileJSON does not publish a max zoom; [data access](https://mapterhorn.com/data-access/) describes planet tiles through z12 and regional archives through z17 where a finer source exists.

CityCut asks for about 5 m per pixel (zoom 14 at Melbourne’s latitude, about 3.8 m on the ground) and steps down while a zoom returns 404. A square is resampled onto a grid of at most 193 samples on a side. Around Melbourne, z15 is 404 and z14 is served, which is the zoom that resolves Geoscience Australia’s [5 m lidar DEM](https://pid.geoscience.gov.au/dataset/ga/89644) (CC BY 4.0). Where that coverage is missing, Mapterhorn uses Copernicus GLO-30 (about 30 m). Attribution for the whole mosaic is [© Mapterhorn](https://mapterhorn.com/attribution).

Elevations in the viewport, the glTF mesh named `Terrain`, and the Rhino `Terrain` layer are those DEM metres (AHD for the Geoscience Australia lidar, geoid height for Copernicus). They are not a survey, and they share the file with buildings and trees: a 12 m building on a 30 m sample runs from Z 30 to Z 42. The terrain mesh is that surface only: no skirt, side walls, or base. With Terrain off, the ground export is the same flat surface, not a thick slab. If the tiles fail, the model keeps the flat surface and shows “Terrain tiles could not be loaded, so the ground is flat.”

Contours on the site plan, the site-plan Illustrator file, and the Rhino file come from Vicmap Elevation when the frame meets Victoria. The metro layer is `EL_CONTOUR_1TO5M` (1 m, with 5 m in places). A frame it does not cover uses `EL_CONTOUR`, the 1:25,000 contours at 10 m and 20 m. Both are queried by bounding box from the browser, paged at 2,000 features, and clipped to the square. On the site plan and in the site-plan Illustrator file, metro 1 m contours thin to 5 m at 1:2500 and smaller scales, so every 5th drawn line is 25 m. 1:500 and 1:1000 keep every 1 m line, with index lines every 5 m. The statewide 10 m and 20 m lines, and the DEM fallback, are not thinned. The Rhino file keeps every contour at its true elevation. Every 5th drawn interval is slightly heavier. If the service errors or does not answer within about 8 seconds, or the frame is outside Victoria, the plan falls back to marching squares on the Mapterhorn grid. That interval is 1 m when the relief is under 8 m, 2 m under 25 m, 5 m under 80 m, and 10 m otherwise. The Rhino `Contours` layer is polylines at the contour elevation. The 3D terrain mesh is unchanged.

## Victorian elevation

The 3D terrain is still the Mapterhorn heightfield. A Victorian DEM was not added. These endpoints were checked from the browser’s point of view (no server, no API key):

- The Vicmap 10 m DEM ImageServer at `https://vicmap.land.vic.gov.au/agsimage/rest/services/elevation/vicmap_dem10m_v5m_ahd_epsg7844/ImageServer` returns HTTP 404 (`Service not found`). The parent `elevation` folder lists no services. The catalogue page still describes a 10 m AHD raster, but there is no live raster to sample. Even a working `exportImage` would be a float GeoTIFF or LERC, which needs a decoder this app does not carry.
- DataVic’s Vicmap Elevation DEM 10 m record (CC BY 4.0) links to `datashare.maps.vic.gov.au` search pages for ECW, GeoTIFF, and JPEG 2000 downloads of the state grid. That is a file portal, not a tile URL, and the host did not send `Access-Control-Allow-Origin`.
- [ELVIS](https://elevation.fsdf.org.au/) answers with the web app HTML, including CORS `*`, not a WCS coverage document.
- Vicmap’s metro 1–5 m contours FeatureServer (`https://services-ap1.arcgis.com/P744lA0wf4LlBZ84/ArcGIS/rest/services/Vicmap_Elevation_METRO_1_to_5_metre/FeatureServer/1`, layer `EL_CONTOUR_1TO5M`) and the statewide 10–20 m contours (`…/Vicmap_Elevation_STATEWIDE_10_to_20_metre/FeatureServer/6`, layer `EL_CONTOUR`) both send CORS `*`. Those polylines are what the site plan uses. The elevation field is `altitude`. `maxRecordCount` is 2000. They are not a height grid: building a terrain mesh from the lines would be a separate interpolation, and the metro layer has holes. The same organisation’s `Vicmap_1m_DEM_Footprints` layer is the footprint of 1 m rasters, not the elevations. The City of Melbourne open-data catalogue does not expose a DEM tile the page can read as heights.

Mapterhorn’s Melbourne tiles already use the 5 m Geoscience Australia lidar, which is finer than the Vicmap 10 m DEM, so the 3D terrain stays on Mapterhorn. A direct Vicmap surface is a follow-up if a CORS-friendly height grid appears.

Trees are placed in four tiers. A later tier is skipped when an earlier tree is already within 3 m. Every tier is clamped: height 2–40 m, crown diameter 1–25 m, and crown at most 1.4 times the height. A crown thinner than half the archetype’s own proportion is lifted so the instance does not become a needle. Trunk diameter stays between 0.05 m and 2 m. Missing, NaN, zero, and negative measurements are dropped and the count is logged. The combined set is capped at 8,000 instances. Canopy infill is trimmed first, then Vicmap.

1. **City of Melbourne**, inside the council urban-forest inventory. The [Trees, with species and dimensions (Urban Forest)](https://data.melbourne.vic.gov.au/explore/dataset/trees-with-species-and-dimensions-urban-forest/) dataset is CC BY 4.0. Its fields are species (`scientific_name`, `genus`, `common_name`), `diameter_breast_height` in centimetres, and `age_description`. There is no crown-spread field and no height field, so crown and height follow the species archetype from DBH and age. The request runs only when the frame meets the council extent; the dataset itself contains only that inventory.
2. **OpenStreetMap** `natural=tree` and `natural=tree_row`, where tier 1 has no tree within 3 m. A bare trunk diameter of 2 or more, or a bare girth wider than a 2 m trunk, is read as centimetres. An explicit `cm` or `mm` suffix is converted. Size comes from `height` or `est_height`, then crown diameter (`diameter_crown`, `crown_diameter`, `diameter:crown`), then trunk girth or diameter, then the species archetype, then the generic tree (10 m tall, 6 m across, 0.35 m trunk).
3. **Vicmap Vegetation Tree Urban**, where tiers 1 and 2 have no tree within 3 m. The layer is the Victorian government’s Vicmap service (Department of Transport and Planning), [CC BY 4.0](https://discover.data.vic.gov.au/dataset/vicmap-vegetation-tree-urban-point). Height is `height_m`. Crown diameter is `canopy_radius_m` × 2 when that radius is a positive number, otherwise it is derived from height. `dense_canopy` picks the broader round-broadleaf archetype; anything else uses the generic broadleaf. The query is the frame envelope only, paged with `resultOffset` at 2,000 rows. A failed fetch is noted and the model still opens.
4. **Canopy infill** of OSM `natural=wood`, `landuse=forest`, and `natural=scrub`. Scrub uses the smaller shrub archetype. Points are a Poisson disc at 7 m. Roads (plus a 2 m buffer), buildings, water, and any sample within 4 m of a tree already placed are left empty.

The Tree sizes panel lists the four counts. Each instance is scaled vertically by height and horizontally by crown. The archetype is one mesh, so the trunk thickens with the crown; the trunk diameter is still stored on the tree. glTF and Rhino exports include every tier, still as instanced silhouettes.

A `natural=tree` area uses its centre. A `natural=tree_row` is sampled about one crown apart (6–14 m).

Genus, species, taxon, `leaf_type`, and `leaf_cycle` pick a massing archetype for OpenStreetMap and for City of Melbourne names. Matching is case-insensitive: spaces and underscores are the same, and a hybrid × is ignored. A species or taxon name is tried first, then the genus, then leaf type, then leaf cycle. Anything still unknown uses the generic broadleaf. The forms are a curated glTF library in `src/assets/trees/` (see that folder’s README). The viewport instances one mesh per form and scales it by the tree’s height and crown diameter. glTF and Rhino exports keep that silhouette; the SVG plan stays a circle per crown.

## Run locally

```bash
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173/citycut-export/` (port 5173, same `/citycut-export/` base as Pages). Open that URL, leave the frame on Melbourne or search for a place, then press **Create model**. `npm run preview` serves the production build at `http://localhost:4173/citycut-export/`.

```bash
npm test
npm run build
npm run preview
```

No API key is required for the defaults.

## Environment

Copy `.env.example` if you want to override the public endpoints. Both variables are optional.

| Variable | Default | Role |
| --- | --- | --- |
| `VITE_OVERPASS_URL` | unset | Optional first Overpass interpreter. By default CityCut tries `overpass.kumi.systems`, then the Mail.ru public instance. |
| `VITE_NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Place search. |

Map tiles:

- **Map** — [OpenFreeMap](https://openfreemap.org/) Positron style (`https://tiles.openfreemap.org/styles/positron`). No key.
- **Satellite** — Esri World Imagery raster tiles. No key. The app must keep the Esri, Vantor, and Earthstar Geographics attribution, which the map control and the page footer both show.

Nominatim’s usage policy asks for an identifying User-Agent. Browsers set that themselves and will not let the page replace it. Fine for light use; put a small proxy in front of Nominatim if you expect real traffic.

## What is real, stubbed, or later

| Feature | Status |
| --- | --- |
| Map, search, square frame, area slider | Real |
| Buildings, roads and rail, water and green | Real, from Overpass, clipped to the frame |
| 3D orbit view | Real |
| Drawing tab (SVG, pan/zoom) | Real |
| glTF `.glb` download | Real |
| Rhino `.3dm` download | Real. Meshes in GDA2020 / MGA metres, Z-up |
| SVG download | Real |
| Satellite basemap and satellite tab | Real preview. Not embedded in the glTF or SVG |
| Trees | Real when the toggle is on. City of Melbourne urban forest, OpenStreetMap trees, Vicmap Tree Urban, and canopy infill. Instanced massing archetypes in the 3D view, glTF, and Rhino; circles on the SVG plan |
| Terrain | Real when the toggle is on (the default). Mapterhorn Terrarium tiles, heightfield mesh named Terrain in the glTF and on a Terrain layer in the 3DM. Off falls back to a flat ground surface |
| Contours | Real on the site plan, the site-plan Illustrator file, and the Rhino `Contours` layer. Vicmap Elevation inside Victoria (metro 1–5 m, otherwise 10 m). Metro 1 m lines draw at 5 m from 1:2500. The terrain DEM is the fallback. The Rhino file keeps every contour |
| Relief / terrain stats | The model page shows the DEM elevation range when terrain loaded |
| DXF, DAE, JPG | Not in this version. No placeholder downloads |
| Site lidar, detected trees | Not in this version. Terrain is the Mapterhorn DEM, not a scan of this block |

## Limits

- Frame side is 0.25–1.4 km so the area stays under about 2 km².
- Live Overpass queries can be slow or refused when the public instances are busy. The app tries the next endpoint and shows an error rather than a partial fake model.
- Most Melbourne buildings have no `height` tag, so many blocks use levels × 3 m or the 9 m default.
- Indoor corridors, tunnels, and `building:part` outlines are skipped so they do not paint through the block.
- A very large multipolygon (more than 80 members) is skipped. Coastlines are not queried.
- Building count is capped at 4,000, keeping the largest footprints.
- Tree count is capped at 8,000. Canopy infill is trimmed first, then Vicmap, then OpenStreetMap, then City of Melbourne.
- Road kilometres are clipped centerline length, including rail and tram, not lane area.
- Relation holes are kept when a multipolygon stitches to a single outer ring.
- The Rhino file projects WGS84 as GDA2020 with no datum shift (about a metre). The MGA zone follows the block’s longitude: zone 55 (EPSG:7855) from 144°E, zone 54 (EPSG:7854) west of that. It is not a survey.
- Terrain is a DEM, not lidar collected for the block. Vertical datum follows the Mapterhorn source (AHD for the Australian 5 m lidar, geoid height for Copernicus). The mesh is the surface itself, with no thickness under it.
- A large park is subdivided so its interior follows the heightfield, down to about the grid spacing or about 24,000 triangles, whichever comes first. A road is split to that same spacing. Buildings are not draped: the whole footprint uses the minimum sample, so the uphill wall can meet the slope part-way up.

## Attribution

Map data © OpenStreetMap contributors. Vector tiles © OpenFreeMap / OpenStreetMap. Satellite imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community. Terrain © [Mapterhorn](https://mapterhorn.com/attribution), including Geoscience Australia’s 5 m DEM (CC BY 4.0) and Copernicus GLO-30 where the 5 m grid is absent. City of Melbourne urban forest © City of Melbourne, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Vicmap Vegetation Tree Urban © State of Victoria (Department of Transport and Planning), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Vicmap Elevation contours © State of Victoria (Department of Transport and Planning), [Creative Commons Attribution 4.0 (CC-BY)](https://creativecommons.org/licenses/by/4.0/).

CityCut is an original interface. Kelvin Chai, Melbourne.

## Layout

- `src/App.tsx` — select screen and model screen
- `src/lib/overpass.ts` — query and endpoint fallback
- `src/lib/parseOsm.ts` — footprints, roads, water, green, trees
- `src/lib/trees.ts` — tree height, crown, and trunk, and where each size came from
- `src/lib/treeTiers.ts` — dedupe, canopy infill, and the instance cap
- `src/lib/comTrees.ts` — City of Melbourne urban-forest trees
- `src/lib/vicmapTrees.ts` — Vicmap Vegetation Tree Urban points
- `src/lib/buildingUse.ts` — building program and colours
- `src/lib/surfaceLayers.ts` — draped layer stack
- `src/lib/footprints.ts` — duplicate footprints
- `src/lib/treeMap.ts` — OSM genus, species, taxon, and leaf tags to an archetype id
- `src/lib/treeForms.ts` — low-poly archetype meshes and their glTF
- `src/assets/trees/` — curated archetype glTF library
- `src/lib/treeArchetypes.ts` — InstancedMesh groups scaled by height and crown
- `src/lib/buildCity.ts` — Three.js group shared by the viewport, the glTF export, and the Rhino export
- `src/lib/crs.ts` — MGA zone and proj4 projection for the `.3dm`
- `src/lib/rhinoExport.ts` — Rhino `.3dm` meshes
- `src/lib/svgPlan.ts` — drawing tab and SVG download
- `src/lib/terrain.ts` — Terrarium decode, height sampling, contours, terrain mesh
- `src/lib/fetchTerrain.ts` — Mapterhorn tile fetch
