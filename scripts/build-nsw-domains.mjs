/**
 * Snapshot the coded-value domains and subtypes that decode NSW cadastre / topographic codes.
 * Source of truth: the ArcGIS layer metadata published by NSW Spatial Services and, for easement
 * and road-corridor subtype domains that Spatial Services does not publish, DPHI's republished
 * copy of the same NSW cadastre (Common/Admin_3857). Run: node scripts/build-nsw-domains.mjs
 */
import { writeFileSync } from "node:fs";

const SCP = "https://portal.spatial.nsw.gov.au/server/rest/services";
const DPHI = "https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Common/Admin_3857/MapServer";

const LAYERS = {
  lots: [`${SCP}/NSW_Land_Parcel_Property_Theme/FeatureServer/8`, `${SCP}/NSW_Land_Parcel_Property_Theme/MapServer/8`],
  easements: [`${SCP}/NSW_Land_Parcel_Property_Theme/FeatureServer/9`, `${DPHI}/25`],
  roadCorridors: [`${DPHI}/26`],
  roadCentrelines: [`${SCP}/NSW_Transport_Theme/FeatureServer/5`],
  railways: [`${SCP}/NSW_Transport_Theme/FeatureServer/7`, `${SCP}/NSW_Transport_Theme/MapServer/7`],
  stations: [`${SCP}/NSW_Transport_Theme/MapServer/0`],
  buildingComplexes: [`${SCP}/NSW_Features_of_Interest_Category/MapServer/3`],
  water: [`${SCP}/NSW_Water_Theme/FeatureServer/6`],
};
const SKIP = new Set(["capturesourcecode", "capturemethodcode"]);

const coded = (domain) =>
  domain && domain.type === "codedValue" ? Object.fromEntries(domain.codedValues.map((c) => [String(c.code), c.name])) : null;

const out = { source: "ArcGIS layer metadata (coded-value domains and subtypes)", generated: new Date().toISOString().slice(0, 10), layers: {} };
for (const [key, urls] of Object.entries(LAYERS)) {
  const layer = { sources: urls, subtypeField: null, subtypes: {}, fields: {}, bySubtype: {} };
  for (const url of urls) {
    const res = await fetch(`${url}?f=json`, { headers: { "User-Agent": "CityCut domain snapshot" } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const meta = await res.json();
    if (meta.error) throw new Error(`${url}: ${meta.error.message}`);
    for (const field of meta.fields ?? []) {
      const name = field.name.toLowerCase();
      const values = coded(field.domain);
      if (values && !SKIP.has(name)) layer.fields[name] = { ...(layer.fields[name] ?? {}), ...values };
    }
    if (meta.typeIdField) layer.subtypeField = meta.typeIdField.toLowerCase();
    for (const type of meta.types ?? []) {
      layer.subtypes[String(type.id)] = type.name;
      for (const [field, domain] of Object.entries(type.domains ?? {})) {
        const values = coded(domain);
        const name = field.toLowerCase();
        if (!values || SKIP.has(name)) continue;
        layer.bySubtype[String(type.id)] = { ...(layer.bySubtype[String(type.id)] ?? {}), [name]: values };
      }
    }
  }
  out.layers[key] = layer;
}
const path = new URL("../src/content/regions/nswDomains.json", import.meta.url);
writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
console.log(Object.entries(out.layers).map(([k, v]) => `${k}: ${Object.keys(v.fields).join(",")} | subtypes ${Object.keys(v.subtypes).length} | bySubtype ${Object.keys(v.bySubtype).length}`).join("\n"));
