export const CENSUS_FIELDS = [
  "pop",
  "a0_14",
  "a15_24",
  "a25_34",
  "a35_44",
  "a45_54",
  "a55_64",
  "a65p",
  "medAge",
  "medHhInc",
  "hhFamily",
  "hhLone",
  "hhGroup",
  "dwHouse",
  "dwSemi",
  "dwApt13",
  "dwApt4p",
  "dwOther",
  "car0",
  "car1",
  "car2",
  "car3p",
  "tenOwned",
  "tenMortgage",
  "tenRent",
  "tenOther",
  "twCar",
  "twPt",
  "twActive",
  "twMulti",
  "twHome",
  "twOther",
];

export const CENSUS_TABLES = ["G01", "G02", "G34", "G35", "G36", "G37", "G62"];

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = new Map();
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const row = {};
    for (let i = 1; i < header.length; i += 1) row[header[i]] = cellNumber(cells[i]);
    rows.set(cells[0].trim(), row);
  }
  return rows;
}

export function cellNumber(raw) {
  if (raw === undefined) return 0;
  const value = raw.trim();
  if (value === "" || value === ".." || value === "-") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sum(row, keys) {
  return keys.reduce((total, key) => total + (row[key] ?? 0), 0);
}

export function extractMetrics(tables) {
  const g01 = tables.G01 ?? {};
  const g02 = tables.G02 ?? {};
  const g34 = tables.G34 ?? {};
  const g35 = tables.G35 ?? {};
  const g36 = tables.G36 ?? {};
  const g37 = tables.G37 ?? {};
  const g62 = tables.G62 ?? {};
  const lone = g35.Num_Psns_UR_1_NonFamHhold ?? 0;
  const tenTotal = g37.Total_Total ?? 0;
  const tenOwned = g37.O_OR_Total ?? 0;
  const tenMortgage = g37.O_MTG_Total ?? 0;
  const tenRent = g37.R_Tot_Total ?? 0;
  const metrics = {
    pop: g01.Tot_P_P ?? 0,
    a0_14: sum(g01, ["Age_0_4_yr_P", "Age_5_14_yr_P"]),
    a15_24: sum(g01, ["Age_15_19_yr_P", "Age_20_24_yr_P"]),
    a25_34: g01.Age_25_34_yr_P ?? 0,
    a35_44: g01.Age_35_44_yr_P ?? 0,
    a45_54: g01.Age_45_54_yr_P ?? 0,
    a55_64: g01.Age_55_64_yr_P ?? 0,
    a65p: sum(g01, ["Age_65_74_yr_P", "Age_75_84_yr_P", "Age_85ov_P"]),
    medAge: g02.Median_age_persons ?? 0,
    medHhInc: g02.Median_tot_hhd_inc_weekly ?? 0,
    hhFamily: g35.Total_FamHhold ?? 0,
    hhLone: lone,
    hhGroup: Math.max(0, (g35.Total_NonFamHhold ?? 0) - lone),
    dwHouse: g36.OPDs_Separate_house_Dwellings ?? 0,
    dwSemi: g36.OPDs_SD_r_t_h_th_Tot_Dwgs ?? 0,
    dwApt13: sum(g36, ["OPDs_F_ap_I_1or2_sty_blk_Ds", "OPDs_F_ap_I_3_sty_blk_Dwgs"]),
    dwApt4p: sum(g36, ["OPDs_F_ap_I_4to8_sty_blk_Ds", "OPDs_F_ap_I_9_m_sty_blk_Ds"]),
    dwOther: sum(g36, ["OPDs_Flt_apt_Att_house_Ds", "OPDs_Other_dwelling_Tot_Dwgs"]),
    car0: g34.Num_MVs_per_dweling_0_MVs ?? 0,
    car1: g34.Num_MVs_per_dweling_1_MVs ?? 0,
    car2: g34.Num_MVs_per_dweling_2_MVs ?? 0,
    car3p: sum(g34, ["Num_MVs_per_dweling_3_MVs", "Num_MVs_per_dweling_4mo_MVs"]),
    tenOwned,
    tenMortgage,
    tenRent,
    tenOther: Math.max(0, tenTotal - tenOwned - tenMortgage - tenRent - (g37.Ten_type_NS_Total ?? 0)),
    twCar: sum(g62, [
      "One_method_Car_as_driver_P",
      "One_method_Car_as_passenger_P",
      "One_method_Truck_P",
      "One_method_Motorbike_scootr_P",
      "One_met_Taxi_or_Rideshare_P",
    ]),
    twPt: sum(g62, ["One_method_Train_P", "One_method_Bus_P", "One_method_Ferry_P", "One_met_Tram_or_lt_rail_P"]),
    twActive: sum(g62, ["One_method_Bicycle_P", "One_method_Walked_only_P"]),
    twMulti: sum(g62, ["Two_methods_Tot_two_methods_P", "Three_meth_Tot_three_meth_P"]),
    twHome: g62.Worked_home_P ?? 0,
    twOther: g62.One_method_Other_P ?? 0,
  };
  return CENSUS_FIELDS.map((key) => metrics[key]);
}

export function ringSignedArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return area / 2;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let maxD = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpDist(ring[i], ring[start], ring[end]);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index >= 0 && maxD > tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const out = ring.filter((_, i) => keep[i] === 1);
  return out.length >= 4 ? out : ring;
}

export const COORD_SCALE = 1e5;

export function encodeRing(ring) {
  const out = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of ring) {
    const qx = Math.round(x * COORD_SCALE);
    const qy = Math.round(y * COORD_SCALE);
    if (out.length > 0 && qx === px && qy === py) continue;
    out.push(qx - px, qy - py);
    px = qx;
    py = qy;
  }
  return out;
}

export function groupShpRings(rings) {
  const polygons = [];
  for (const ring of rings) {
    if (ringSignedArea(ring) <= 0 || polygons.length === 0) polygons.push([ring]);
    else polygons[polygons.length - 1].push(ring);
  }
  return polygons;
}

export function parseShpPolygons(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const records = [];
  let offset = 100;
  while (offset + 8 <= buffer.byteLength) {
    const contentBytes = view.getInt32(offset + 4, false) * 2;
    const base = offset + 8;
    const type = view.getInt32(base, true);
    if (type === 5) {
      const numParts = view.getInt32(base + 36, true);
      const numPoints = view.getInt32(base + 40, true);
      const partsAt = base + 44;
      const pointsAt = partsAt + numParts * 4;
      const rings = [];
      for (let p = 0; p < numParts; p += 1) {
        const from = view.getInt32(partsAt + p * 4, true);
        const to = p + 1 < numParts ? view.getInt32(partsAt + (p + 1) * 4, true) : numPoints;
        const ring = [];
        for (let i = from; i < to; i += 1) {
          ring.push([view.getFloat64(pointsAt + i * 16, true), view.getFloat64(pointsAt + i * 16 + 8, true)]);
        }
        rings.push(ring);
      }
      records.push(rings);
    } else {
      records.push(null);
    }
    offset = base + contentBytes;
  }
  return records;
}

export function parseDbf(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const count = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  const fields = [];
  for (let at = 32; buffer[at] !== 0x0d; at += 32) {
    const name = new TextDecoder().decode(buffer.subarray(at, at + 11)).replace(/\0.*$/, "");
    fields.push({ name, length: buffer[at + 16] });
  }
  const rows = [];
  const decoder = new TextDecoder("latin1");
  for (let r = 0; r < count; r += 1) {
    let at = headerLength + r * recordLength + 1;
    const row = {};
    for (const field of fields) {
      row[field.name] = decoder.decode(buffer.subarray(at, at + field.length)).trim();
      at += field.length;
    }
    rows.push(row);
  }
  return rows;
}
