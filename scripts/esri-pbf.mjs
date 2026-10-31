import { PbfReader } from "pbf";

function readValue(pbf, end) {
  let value = null;
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    const type = tag & 7;
    switch (field) {
      case 1: value = pbf.readString(); break;
      case 2: value = pbf.readFloat(); break;
      case 3: value = pbf.readDouble(); break;
      case 4: value = pbf.readSVarint(); break;
      case 5: value = pbf.readVarint(); break;
      case 6: value = pbf.readVarint(true); break;
      case 7: value = pbf.readVarint(true); break;
      case 8: value = pbf.readSVarint(); break;
      case 9: value = pbf.readBoolean(); break;
      default: pbf.skip(type);
    }
  }
  return value;
}

function readSub(pbf, fn, init) {
  const end = pbf.readVarint() + pbf.pos;
  const out = init;
  while (pbf.pos < end) {
    const tag = pbf.readVarint();
    fn(tag >> 3, tag & 7, out, pbf, end);
  }
  pbf.pos = end;
  return out;
}

function readTransform(pbf) {
  return readSub(pbf, (field, type, t, p) => {
    if (field === 1) t.origin = p.readVarint();
    else if (field === 2) readSub(p, (f, ty, s, q) => { if (f === 1) s.x = q.readDouble(); else if (f === 2) s.y = q.readDouble(); else q.skip(ty); }, t.scale);
    else if (field === 3) readSub(p, (f, ty, s, q) => { if (f === 1) s.x = q.readDouble(); else if (f === 2) s.y = q.readDouble(); else q.skip(ty); }, t.translate);
    else p.skip(type);
  }, { origin: 0, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } });
}

function readGeometry(pbf) {
  return readSub(pbf, (field, type, g, p) => {
    if (field === 2) {
      if (type === 2) { const end = p.readVarint() + p.pos; while (p.pos < end) g.lengths.push(p.readVarint()); }
      else g.lengths.push(p.readVarint());
    } else if (field === 3) {
      if (type === 2) { const end = p.readVarint() + p.pos; while (p.pos < end) g.coords.push(p.readSVarint()); }
      else g.coords.push(p.readSVarint());
    }
    else p.skip(type);
  }, { lengths: [], coords: [] });
}

function readFeature(pbf) {
  return readSub(pbf, (field, type, f, p) => {
    if (field === 1) { const end = p.readVarint() + p.pos; f.attributes.push(readValue(p, end)); p.pos = end; }
    else if (field === 2) f.geometry = readGeometry(p);
    else p.skip(type);
  }, { attributes: [], geometry: null });
}

function readField(pbf) {
  return readSub(pbf, (field, type, f, p) => {
    if (field === 1) f.name = p.readString(); else p.skip(type);
  }, { name: "" });
}

function readFeatureResult(pbf) {
  return readSub(pbf, (field, type, r, p) => {
    if (field === 9) r.exceededTransferLimit = p.readBoolean();
    else if (field === 12) r.transform = readTransform(p);
    else if (field === 13) r.fields.push(readField(p).name);
    else if (field === 15) r.features.push(readFeature(p));
    else p.skip(type);
  }, { exceededTransferLimit: false, transform: null, fields: [], features: [] });
}

/**
 * @param {Uint8Array} buf
 * @returns {{ count?: number, exceededTransferLimit: boolean, fields: string[],
 *   points: { lon: number, lat: number, attributes: Record<string, unknown> }[] }}
 */
export function decodeEsriPbf(buf) {
  const pbf = new PbfReader(buf);
  let result = null;
  let count;
  while (pbf.pos < pbf.length) {
    const tag = pbf.readVarint();
    const field = tag >> 3;
    if (field === 2) {
      readSub(pbf, (f, ty, _o, p) => {
        if (f === 1) result = readFeatureResult(p);
        else if (f === 2) readSub(p, (cf, cty, _c, q) => { if (cf === 1) count = q.readVarint(); else q.skip(cty); }, {});
        else p.skip(ty);
      }, {});
    } else pbf.skip(tag & 7);
  }
  if (count !== undefined && !result) return { count, exceededTransferLimit: false, fields: [], points: [] };
  if (!result) throw new Error("ArcGIS pbf response had no feature result.");
  const t = result.transform ?? { origin: 0, scale: { x: 1, y: 1 }, translate: { x: 0, y: 0 } };
  const upperLeft = t.origin === 0;
  const points = [];
  for (const feature of result.features) {
    const attributes = {};
    result.fields.forEach((name, i) => { attributes[name] = feature.attributes[i] ?? null; });
    const coords = feature.geometry?.coords ?? [];
    if (coords.length < 2) { points.push({ lon: NaN, lat: NaN, attributes }); continue; }
    const lon = coords[0] * t.scale.x + t.translate.x;
    const lat = upperLeft ? t.translate.y - coords[1] * t.scale.y : coords[1] * t.scale.y + t.translate.y;
    points.push({ lon, lat, attributes });
  }
  return { exceededTransferLimit: result.exceededTransferLimit, fields: result.fields, points };
}
