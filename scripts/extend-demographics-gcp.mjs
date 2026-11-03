import { createWriteStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const GCP_ZIP =
  "https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_SA1_for_VIC_short-header.zip";
const CACHE = "tmp/demographics";
const METRO_PATH = "public/demographics-metro.json";
const MANIFEST_PATH = "public/demographics-manifest.json";

const AGE_BANDS = ["0-14", "15-24", "25-34", "35-49", "50-64", "65+"];
const RENT_BIN_KEYS = ["0-149", "150-249", "250-349", "350-449", "450-549", "550-649", "650+"];

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function readCsv(path) {
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const rows = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const row = Object.fromEntries(header.map((key, index) => [key, cols[index] ?? ""]));
    const code = row.SA1_CODE_2021 ?? row.sa1_code_2021;
    if (code) rows.set(String(code), row);
  }
  return rows;
}

function num(row, key) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function sumKeys(row, keys) {
  return keys.reduce((total, key) => total + num(row, key), 0);
}

function ageMaleFemaleFromG01(row) {
  const mid4554m = num(row, "Age_45_54_yr_M") * 0.5;
  const mid4554f = num(row, "Age_45_54_yr_F") * 0.5;
  return {
    male: {
      "0-14": sumKeys(row, ["Age_0_4_yr_M", "Age_5_14_yr_M"]),
      "15-24": sumKeys(row, ["Age_15_19_yr_M", "Age_20_24_yr_M"]),
      "25-34": num(row, "Age_25_34_yr_M"),
      "35-49": num(row, "Age_35_44_yr_M") + mid4554m,
      "50-64": num(row, "Age_55_64_yr_M") + mid4554m,
      "65+": sumKeys(row, ["Age_65_74_yr_M", "Age_75_84_yr_M", "Age_85ov_M"]),
    },
    female: {
      "0-14": sumKeys(row, ["Age_0_4_yr_F", "Age_5_14_yr_F"]),
      "15-24": sumKeys(row, ["Age_15_19_yr_F", "Age_20_24_yr_F"]),
      "25-34": num(row, "Age_25_34_yr_F"),
      "35-49": num(row, "Age_35_44_yr_F") + mid4554f,
      "50-64": num(row, "Age_55_64_yr_F") + mid4554f,
      "65+": sumKeys(row, ["Age_65_74_yr_F", "Age_75_84_yr_F", "Age_85ov_F"]),
    },
  };
}

function rentBinsFromG40(row) {
  return {
    "0-149": sumKeys(row, ["R_1_74_Tot", "R_75_99_Tot", "R_100_149_Tot"]),
    "150-249": sumKeys(row, ["R_150_199_Tot", "R_200_224_Tot", "R_225_274_Tot"]),
    "250-349": num(row, "R_275_349_Tot"),
    "350-449": num(row, "R_350_449_Tot"),
    "450-549": num(row, "R_450_549_Tot"),
    "550-649": num(row, "R_550_649_Tot"),
    "650+": sumKeys(row, [
      "R_650_749_Tot",
      "R_750_849_Tot",
      "R_850_949_Tot",
      "R_950_over_Tot",
    ]),
  };
}

async function download(url, dest) {
  if (existsSync(dest)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${url}: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

async function extractCsv(zipPath, memberSuffix, outPath) {
  if (existsSync(outPath)) return;
  const { spawnSync } = await import("node:child_process");
  const listing = spawnSync("unzip", ["-l", zipPath], { encoding: "utf8" });
  const line = listing.stdout.split("\n").find((row) => row.includes(memberSuffix));
  if (!line) throw new Error(`Missing ${memberSuffix}`);
  const member = line.replace(/^\s*\d+\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+/, "").trim();
  const out = spawnSync("unzip", ["-p", zipPath, member], { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });
  if (out.status !== 0) throw new Error(`Extract failed ${memberSuffix}`);
  writeFileSync(outPath, out.stdout);
}

async function main() {
  const zipPath = `${CACHE}/vic-gcp.zip`;
  await download(GCP_ZIP, zipPath);
  const extractDir = `${CACHE}/gcp-vic-ext`;
  const { mkdirSync } = await import("node:fs");
  mkdirSync(extractDir, { recursive: true });
  const files = [
    ["2021Census_G01_VIC_SA1.csv", "g01"],
    ["2021Census_G02_VIC_SA1.csv", "g02"],
    ["2021Census_G36_VIC_SA1.csv", "g36"],
    ["2021Census_G37_VIC_SA1.csv", "g37"],
    ["2021Census_G40_VIC_SA1.csv", "g40"],
  ];
  for (const [name, key] of files) {
    await extractCsv(zipPath, name, `${extractDir}/${key}.csv`);
  }

  const g01 = readCsv(`${extractDir}/g01.csv`);
  const g02 = readCsv(`${extractDir}/g02.csv`);
  const g36 = readCsv(`${extractDir}/g36.csv`);
  const g37 = readCsv(`${extractDir}/g37.csv`);
  const g40 = readCsv(`${extractDir}/g40.csv`);

  const dataset = JSON.parse(readFileSync(METRO_PATH, "utf8"));
  dataset.version = 2;
  dataset.censusRelease = "2021 GCP SA1 (latest downloadable SA1 GCP at build time; 2026 Census SA1 GCP not released)";

  const bench = {
    population: 0,
    age: Object.fromEntries(AGE_BANDS.map((band) => [band, 0])),
    ageMale: Object.fromEntries(AGE_BANDS.map((band) => [band, 0])),
    ageFemale: Object.fromEntries(AGE_BANDS.map((band) => [band, 0])),
    households: { ...dataset.benchmark.households },
    medianAge: 0,
    medianAgeWeight: 0,
    apartmentShare: 0,
    rentingShare: 0,
    rentMedianWeekly: 0,
    rentMedianWeight: 0,
    rentBins: Object.fromEntries(RENT_BIN_KEYS.map((bin) => [bin, 0])),
  };

  for (const unit of dataset.units) {
    const popRow = g01.get(unit.code);
    const medRow = g02.get(unit.code);
    const dwellRow = g36.get(unit.code);
    const tenureRow = g37.get(unit.code);
    const rentRow = g40.get(unit.code);
    if (!popRow) continue;
    const { male, female } = ageMaleFemaleFromG01(popRow);
    unit.ageMale = male;
    unit.ageFemale = female;
    const medianAge = num(medRow, "Median_age_persons");
    unit.medianAge = medianAge > 0 ? medianAge : null;
    const dwellTotal = sumKeys(dwellRow, [
      "OPDs_Separate_house_Persons",
      "OPDs_SD_r_t_h_th_Tot_Psns",
      "OPDs_Flt_apart_Tot_Psns",
      "OPDs_Other_dwelling_Tot_Psns",
    ]);
    const flat = num(dwellRow, "OPDs_Flt_apart_Tot_Psns");
    unit.apartmentShare = dwellTotal > 0 ? (flat / dwellTotal) * 100 : null;
    const tenureTotal = num(tenureRow, "Total_Total");
    const renting = num(tenureRow, "R_Tot_Total");
    unit.rentingShare = tenureTotal > 0 ? (renting / tenureTotal) * 100 : null;
    const rentBins = rentBinsFromG40(rentRow);
    unit.rentBins = rentBins;
    const rentMedian = num(medRow, "Median_rent_weekly");
    unit.rentMedianWeekly = rentMedian > 0 ? rentMedian : null;

    bench.population += unit.population;
    for (const band of AGE_BANDS) {
      bench.age[band] += unit.age[band];
      bench.ageMale[band] += male[band];
      bench.ageFemale[band] += female[band];
    }
    if (unit.medianAge != null) {
      bench.medianAge += unit.medianAge * unit.population;
      bench.medianAgeWeight += unit.population;
    }
    if (unit.apartmentShare != null) bench.apartmentShare += unit.apartmentShare * unit.population;
    if (unit.rentingShare != null) bench.rentingShare += unit.rentingShare * unit.population;
    if (unit.rentMedianWeekly != null) {
      bench.rentMedianWeekly += unit.rentMedianWeekly * unit.population;
      bench.rentMedianWeight += unit.population;
    }
    for (const bin of RENT_BIN_KEYS) bench.rentBins[bin] += rentBins[bin];
  }

  dataset.benchmark = {
    population: bench.population,
    age: bench.age,
    ageMale: bench.ageMale,
    ageFemale: bench.ageFemale,
    households: bench.households,
    medianAge: bench.medianAgeWeight > 0 ? bench.medianAge / bench.medianAgeWeight : null,
    apartmentShare: bench.population > 0 ? bench.apartmentShare / bench.population : null,
    rentingShare: bench.population > 0 ? bench.rentingShare / bench.population : null,
    rentMedianWeekly:
      bench.rentMedianWeight > 0 ? Math.round(bench.rentMedianWeekly / bench.rentMedianWeight) : null,
    rentBins: bench.rentBins,
  };

  writeFileSync(METRO_PATH, JSON.stringify(dataset));
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  manifest.version = 2;
  manifest.extendedAt = new Date().toISOString();
  manifest.censusRelease = dataset.censusRelease;
  manifest.censusDatapackUrl = GCP_ZIP;
  manifest.asgsRelease = "ASGS 2021 SA1 (MapServer)";
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest));
  console.log(JSON.stringify({ units: dataset.units.length, bytes: readFileSync(METRO_PATH).length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
