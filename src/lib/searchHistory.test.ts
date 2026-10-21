import { describe, expect, it } from "vitest";
import { SEARCH_HISTORY_KEY, addSearchHistory, clearSearchHistory, readSearchHistory } from "./searchHistory";
import type { PlaceHit } from "../types";

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}
const hit = (n: number): PlaceHit => ({ id: `p${n}`, label: `Place ${n}`, detail: "VIC", lat: -37 - n / 100, lon: 145, bounds: null });

describe("search history", () => {
  it("keeps the last 10, newest first, without duplicates", () => {
    const s = memory();
    for (let n = 1; n <= 12; n += 1) addSearchHistory(s, hit(n));
    addSearchHistory(s, hit(5));
    const list = readSearchHistory(s);
    expect(list).toHaveLength(10);
    expect(list.map((h) => h.id)).toEqual(["p5", "p12", "p11", "p10", "p9", "p8", "p7", "p6", "p4", "p3"]);
  });
  it("clears", () => {
    const s = memory();
    addSearchHistory(s, hit(1));
    clearSearchHistory(s);
    expect(readSearchHistory(s)).toEqual([]);
    expect(s.map.has(SEARCH_HISTORY_KEY)).toBe(false);
  });
  it("ignores junk and blocked storage", () => {
    const s = memory();
    s.setItem(SEARCH_HISTORY_KEY, "{not json");
    expect(readSearchHistory(s)).toEqual([]);
    s.setItem(SEARCH_HISTORY_KEY, JSON.stringify([{ id: 1 }, hit(2)]));
    expect(readSearchHistory(s).map((h) => h.id)).toEqual(["p2"]);
    const blocked = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(readSearchHistory(blocked)).toEqual([]);
    expect(addSearchHistory(blocked, hit(3)).map((h) => h.id)).toEqual(["p3"]);
    expect(() => clearSearchHistory(blocked)).not.toThrow();
  });
});
