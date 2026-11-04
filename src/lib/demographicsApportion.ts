import type { DemographicsSa1Unit } from "./demographicsTypes";
import { DEMOGRAPHICS_AGE_BANDS, DEMOGRAPHICS_HOUSEHOLD_TYPES, DEMOGRAPHICS_RENT_BINS } from "./demographicsTypes";
import type { DemographicsParcelRecord } from "./demographicsParcels";

function scaleRecord<T extends string>(
  source: Record<T, number> | undefined,
  share: number,
  keys: readonly T[],
): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const key of keys) {
    out[key] = (source?.[key] ?? 0) * share;
  }
  return out;
}

function apportionGroup(unit: DemographicsSa1Unit, group: DemographicsParcelRecord[]): DemographicsParcelRecord[] {
  const totalArea = group.reduce((sum, item) => sum + Math.max(item.areaM2, 0), 0);
  if (totalArea <= 0) return group;
  return group.map((item) => {
    const share = Math.max(item.areaM2, 0) / totalArea;
    const ageMale = scaleRecord(unit.ageMale, share, DEMOGRAPHICS_AGE_BANDS);
    const ageFemale = scaleRecord(unit.ageFemale, share, DEMOGRAPHICS_AGE_BANDS);
    if (!unit.ageMale && !unit.ageFemale) {
      for (const band of DEMOGRAPHICS_AGE_BANDS) {
        const total = unit.age[band] ?? 0;
        ageMale[band] = total * 0.49 * share;
        ageFemale[band] = total * 0.51 * share;
      }
    }
    return {
      ...item,
      residents: unit.population * share,
      medianAge: unit.medianAge ?? null,
      apartmentShare: unit.apartmentShare ?? null,
      rentingShare: unit.rentingShare ?? null,
      rentMedianWeekly: unit.rentMedianWeekly ?? null,
      ageMale,
      ageFemale,
      households: scaleRecord(unit.households, share, DEMOGRAPHICS_HOUSEHOLD_TYPES),
      rentBins: scaleRecord(unit.rentBins, share, DEMOGRAPHICS_RENT_BINS),
    };
  });
}

export function apportionParcelsFromSa1Units(
  parcels: DemographicsParcelRecord[],
  units: DemographicsSa1Unit[],
): DemographicsParcelRecord[] {
  if (parcels.length === 0 || units.length === 0) return parcels;
  const unitByCode = new Map(units.map((unit) => [unit.code, unit]));
  const bySa1 = new Map<string, DemographicsParcelRecord[]>();
  const noSa1: DemographicsParcelRecord[] = [];
  for (const parcel of parcels) {
    if (!parcel.sa1Code) {
      noSa1.push(parcel);
      continue;
    }
    const group = bySa1.get(parcel.sa1Code) ?? [];
    group.push(parcel);
    bySa1.set(parcel.sa1Code, group);
  }
  const out: DemographicsParcelRecord[] = [...noSa1];
  for (const [code, group] of bySa1) {
    const unit = unitByCode.get(code);
    out.push(...(unit ? apportionGroup(unit, group) : group));
  }
  return out;
}
