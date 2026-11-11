import { describe, expect, it } from "vitest";
import { crc32, zipStore } from "./zip";
import {
  SUN_STUDY_HOURS,
  buildSunStudyZip,
  sunStudyFailureText,
  sunStudyFrameName,
  sunStudySiteSlug,
  sunStudyZipName,
} from "./sunStudyExport";


function readZip(zip: Uint8Array): { name: string; bytes: Uint8Array }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    const localNameLen = view.getUint16(local + 26, true);
    const bytes = zip.subarray(local + 30 + localNameLen, local + 30 + localNameLen + size);
    expect(crc32(bytes)).toBe(crc);
    out.push({ name, bytes });
    at += 46 + nameLen;
  }
  return out;
}

describe("zip writer", () => {
  it("matches the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("round-trips entries", () => {
    const zip = zipStore([
      { name: "a.ai", bytes: new Uint8Array([1, 2, 3]) },
      { name: "b.ai", bytes: new Uint8Array([4, 5]) },
    ]);
    expect(readZip(zip).map((e) => [e.name, Array.from(e.bytes)])).toEqual([["a.ai", [1, 2, 3]], ["b.ai", [4, 5]]]);
  });
});

describe("sun study export", () => {
  const date = { year: 2026, month: 9, day: 22 };
  it("names frames and the zip", () => {
    expect(sunStudyFrameName("kew", date, 9)).toBe("CityCut_kew_SunStudy_2026-09-22_0900.ai");
    expect(sunStudyFrameName("kew", date, 15)).toBe("CityCut_kew_SunStudy_2026-09-22_1500.ai");
    expect(sunStudyZipName("kew", date)).toBe("CityCut_kew_SunStudy_2026-09-22.zip");
    expect(sunStudySiteSlug("Kew, Victoria", { lat: -37.8, lon: 145 })).toBe("kew-victoria");
    expect(sunStudySiteSlug("", { lat: -37.8069, lon: 145.0347 })).toBe("37.8069S-145.0347E");
  });
  it("renders 9am to 3pm and zips 7 frames in hour order", async () => {
    const seen: number[] = [];
    const result = await buildSunStudyZip("kew", date, async (hour) => {
      seen.push(hour);
      return new TextEncoder().encode(`frame ${hour}`);
    });
    expect(seen).toEqual([...SUN_STUDY_HOURS]);
    expect(result.failures).toEqual([]);
    const entries = readZip(result.zip!);
    expect(entries.map((e) => e.name)).toEqual(SUN_STUDY_HOURS.map((h) => sunStudyFrameName("kew", date, h)));
    expect(new TextDecoder().decode(entries[6]!.bytes)).toBe("frame 15");
    expect(sunStudyFailureText(result)).toBeNull();
  });
  it("names every failed frame and keeps the rest", async () => {
    const result = await buildSunStudyZip("kew", date, async (hour) => {
      if (hour === 13) throw new Error("no sun");
      if (hour === 14) return new Uint8Array();
      return new Uint8Array([hour]);
    });
    expect(result.files).toHaveLength(5);
    expect(readZip(result.zip!)).toHaveLength(5);
    expect(sunStudyFailureText(result)).toBe(
      "Sun study zip is missing 2 of 7 frames: 1pm (no sun), 2pm (empty file). The other 5 are in the zip.",
    );
  });
  it("writes no zip when every frame fails, and says so", async () => {
    const result = await buildSunStudyZip("kew", date, async () => {
      throw new Error("boom");
    });
    expect(result.zip).toBeNull();
    expect(sunStudyFailureText(result)).toMatch(/^Sun study not written: every frame failed/);
  });
});
