import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const root = process.cwd();
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "public/site-layers/sydney-rozelle/manifest.json"), "utf8"),
);
const origin = { lon: manifest.origin.lonLat[0], lat: manifest.origin.lonLat[1] };
const zone = 56;
const { storedSiteRelativeToScene } = await import("../src/lib/storedSiteLayers/transform.ts");
const { storedSitePartIsTerrainDrapeSurface, storedSitePartStats } = await import(
  "../src/lib/storedSiteLayers/storedSiteGroundMesh.ts"
);

const buf = fs.readFileSync(path.join(root, "public/site-layers/sydney-rozelle/buildings.glb"));
const loader = new GLTFLoader();
const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
gltf.scene.updateMatrixWorld(true);

const meshes = [];
gltf.scene.traverse((node) => {
  if (node.isMesh) meshes.push(node);
});

const meshStats = meshes.map((mesh) => {
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  const pos = geo.getAttribute("position");
  const index = geo.getIndex();
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = storedSiteRelativeToScene(pos.getX(i), pos.getY(i), pos.getZ(i), manifest, origin, zone);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  const outIdx = index ? Array.from({ length: index.count }, (_, i) => index.getX(i)) : [...Array(pos.count).keys()];
  const part = {
    positions: out,
    indices: new Uint32Array(outIdx),
    buildingId: null,
    structure: true,
  };
  const stats = storedSitePartStats(part);
  return { name: mesh.name, drop: storedSitePartIsTerrainDrapeSurface(part), stats };
});

const drops = meshStats.filter((m) => m.drop);
console.log(JSON.stringify({ meshes: meshStats.length, drops: drops.length, meshStats, dropped: drops }, null, 2));