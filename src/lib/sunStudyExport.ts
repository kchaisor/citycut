import { slugifyPlace } from "./placeLabel";
import { zipStore, type ZipEntry } from "./zip";

/** Sun study frames: each hour from 9am to 3pm, Melbourne clock time (the app's solar clock). */
export const SUN_STUDY_HOURS = [9, 10, 11, 12, 13, 14, 15] as const;

export type SunStudyDate = { year: number; month: number; day: number };

const pad = (n: number) => String(n).padStart(2, "0");

export function sunStudyDateText(date: SunStudyDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/** Site slug for file names: the place slug, else the rounded centre ("37.8069S-145.0347E"). */
export function sunStudySiteSlug(placeLabel: string, center: { lat: number; lon: number }): string {
  const slug = slugifyPlace(placeLabel);
  if (slug) return slug;
  const lat = `${Math.abs(center.lat).toFixed(4)}${center.lat < 0 ? "S" : "N"}`;
  const lon = `${Math.abs(center.lon).toFixed(4)}${center.lon < 0 ? "W" : "E"}`;
  return `${lat}-${lon}`;
}

/** CityCut_<site-slug>_SunStudy_<YYYY-MM-DD>_<HHMM>.ai */
export function sunStudyFrameName(site: string, date: SunStudyDate, hour: number): string {
  return `CityCut_${site}_SunStudy_${sunStudyDateText(date)}_${pad(hour)}00.ai`;
}

/** CityCut_<site-slug>_SunStudy_<YYYY-MM-DD>.zip */
export function sunStudyZipName(site: string, date: SunStudyDate): string {
  return `CityCut_${site}_SunStudy_${sunStudyDateText(date)}.zip`;
}

export type SunStudyFailure = { hour: number; message: string };

export type SunStudyResult = {
  zip: Uint8Array | null;
  files: string[];
  failures: SunStudyFailure[];
};

function hourText(hour: number): string {
  return hour === 12 ? "12pm" : hour > 12 ? `${hour - 12}pm` : `${hour}am`;
}

/** Plain sentence naming every failed frame, or null when all were written. */
export function sunStudyFailureText(result: Pick<SunStudyResult, "failures" | "files">): string | null {
  if (result.failures.length === 0) return null;
  const hours = result.failures.map((f) => `${hourText(f.hour)} (${f.message})`).join(", ");
  if (result.files.length === 0) return `Sun study not written: every frame failed: ${hours}.`;
  return `Sun study zip is missing ${result.failures.length} of ${SUN_STUDY_HOURS.length} frames: ${hours}. The other ${result.files.length} are in the zip.`;
}

/**
 * Render one .ai per sun study hour with `renderFrame` (the existing site plan .ai writer)
 * and zip them in hour order. Every frame is attempted; failures are collected, never dropped.
 */
export async function buildSunStudyZip(
  site: string,
  date: SunStudyDate,
  renderFrame: (hour: number) => Promise<Uint8Array>,
  onProgress?: (done: number, total: number) => void,
): Promise<SunStudyResult> {
  const entries: ZipEntry[] = [];
  const failures: SunStudyFailure[] = [];
  let done = 0;
  for (const hour of SUN_STUDY_HOURS) {
    try {
      const bytes = await renderFrame(hour);
      if (!bytes || bytes.length === 0) throw new Error("empty file");
      entries.push({ name: sunStudyFrameName(site, date, hour), bytes });
    } catch (error) {
      failures.push({ hour, message: error instanceof Error && error.message ? error.message : "could not be written" });
    }
    done += 1;
    onProgress?.(done, SUN_STUDY_HOURS.length);
  }
  return { zip: entries.length ? zipStore(entries) : null, files: entries.map((e) => e.name), failures };
}
