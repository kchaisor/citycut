export const FAQ = [
  {
    q: "What is CityCut?",
    a: "CityCut takes a square of a city and exports it as a simple 3D model and a 2D site plan. It is a study tool for early design work, not a survey.",
  },
  {
    q: "Where does the geometry come from?",
    a: "OpenStreetMap, read through the Overpass API. Place search uses Nominatim. The street map uses OpenFreeMap. The satellite view uses Esri World Imagery. Terrain, when that layer is on, is a heightfield from Mapterhorn tiles (https://tiles.mapterhorn.com, Terrarium WebP). Around Melbourne those tiles resolve Geoscience Australia’s 5 m lidar DEM (CC BY 4.0); elsewhere they fall back to Copernicus GLO-30. Elevations are metres from that DEM, not a survey. Turn Terrain off and the ground is the flat slab.",
  },
  {
    q: "How are building heights chosen?",
    a: "If OpenStreetMap has a height tag, that value is used (feet are converted). Otherwise building:levels × 3 m. If neither is present, the building is 9 m tall.",
  },
  {
    q: "Which layers are real?",
    a: "Buildings, roads and rail, water and green, and trees are queried and drawn. Terrain is on by default and replaces the flat ground; if the tiles fail, the model falls back to the flat slab and says so. Each building sits on the lowest terrain sample along its footprint, and each tree sits on the sample at its trunk. Roads, rail, parks, and water are draped just above the surface. Contours, when that option is on and terrain loaded, are drawn on the site plan at 1, 2, 5, or 10 m depending on the relief. Satellite image only changes the basemap preview.",
  },
  {
    q: "How are trees drawn?",
    a: "Trees are OpenStreetMap natural=tree points, tree areas, and tree rows. Each one uses a low-poly massing form chosen from genus, species, taxon, leaf type, and leaf cycle, with a generic broadleaf when those tags do not match. Size uses OSM height, est_height, crown diameter, and trunk circumference or diameter when those tags exist. Inside the City of Melbourne, a tree with none of those tags can take diameter at breast height and age from the City’s urban-forest inventory. Otherwise the species archetype supplies a mature size, and an unknown tree is 10 m tall and 6 m across. Height stays between 2 m and 40 m, crown between 1 m and 25 m, trunk between 0.05 m and 2 m. The 3D view draws one instanced mesh per form, scaled by height and crown.",
  },
  {
    q: "What can I download?",
    a: "A binary glTF (.glb), a Rhino 3DM, and an SVG site plan. Trees, when that layer is on, are in all three: meshes in the glTF and 3DM, circles on the plan. With Terrain on, the glTF includes a mesh named Terrain, and the 3DM adds a Terrain layer in the same GDA2020 / MGA metres, Z-up, with absolute DEM elevations. The SVG can include contour lines. With Terrain off, those files match the flat-ground export. The 3DM projects WGS84 as GDA2020 without a datum shift, about a metre off for site work, and the zone follows the block longitude (west of 144°E is zone 54). DXF, DAE, and JPG are not in this version.",
  },
  {
    q: "How large can the frame be?",
    a: "The side runs from 0.25 km to 1.4 km, which keeps the area under about 2 km². Larger extracts are a poor fit for a live Overpass query in the browser.",
  },
  {
    q: "Who made this?",
    a: "Kelvin Chai, an architect in Melbourne. The map opens on the Melbourne CBD.",
  },
] as const;
