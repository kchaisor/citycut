import rhino3dm from "rhino3dm";
import proj4 from "proj4";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const origin = { lon: 144.98038, lat: -37.81356 };
const zone = 55;
const localEast = 60;
const localNorth = -60;

const def = `+proj=utm +zone=${zone} +south +datum=GDA2020 +units=m +no_defs`;
const wgs = "+proj=longlat +datum=GDA2020 +no_defs";
const [cx, cy] = proj4(wgs, def, [origin.lon, origin.lat]);
const E = cx + localEast;
const N = cy + localNorth;

const __dir = dirname(fileURLToPath(import.meta.url));
const out = join(__dir, "../src/lib/__fixtures__/east-melbourne-import-massing.3dm");

const r = await rhino3dm();
const doc = new r.File3dm();
doc.settings().modelUnitSystem = r.UnitSystem.Meters;
const mesh = new r.Mesh();
const verts = [
  [-12, -18, 0],
  [12, -18, 0],
  [12, 18, 0],
  [-12, 18, 0],
  [-12, -18, 40],
  [12, -18, 40],
  [12, 18, 40],
  [-12, 18, 40],
];
for (const [x, y, z] of verts) mesh.vertices().add(E + x, N + y, 30 + z);
const quads = [
  [0, 3, 2, 1],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
];
for (const [a, b, c, d] of quads) {
  mesh.faces().addTriFace(a, b, c);
  mesh.faces().addTriFace(a, c, d);
}
doc.objects().addMesh(mesh, null);
const bytes = doc.toByteArray();
writeFileSync(out, Buffer.from(bytes));
doc.destroy();
console.log(`Wrote ${bytes.length} bytes to ${out}`);
