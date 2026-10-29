import { describe, expect, it } from "vitest";
import { filterCommandTools, parseCommandQuery } from "./commandQuery";

describe("parseCommandQuery", () => {
  it("keeps the whole string when there is no trailing distance", () => {
    expect(parseCommandQuery("Federation Square")).toEqual({
      placeQuery: "Federation Square",
      sideKm: null,
    });
  });

  it("parses metres at the end", () => {
    expect(parseCommandQuery("Fed Square 200m")).toEqual({
      placeQuery: "Fed Square",
      sideKm: 0.25,
    });
  });

  it("parses spaced metres", () => {
    expect(parseCommandQuery("Southbank 500 m")).toEqual({
      placeQuery: "Southbank",
      sideKm: 0.5,
    });
  });

  it("parses kilometres", () => {
    expect(parseCommandQuery("Fitzroy 1km")).toEqual({
      placeQuery: "Fitzroy",
      sideKm: 1,
    });
  });

  it("clamps below minimum side", () => {
    expect(parseCommandQuery("CBD 100m").sideKm).toBe(0.25);
  });

  it("clamps above maximum side", () => {
    expect(parseCommandQuery("Melbourne 3km").sideKm).toBe(2);
  });
});

describe("filterCommandTools", () => {
  const tools = [
    { id: "sun", label: "Sun", keywords: ["solar"] as const },
    { id: "wind", label: "Wind", keywords: ["rose"] as const },
  ];

  it("returns all tools for an empty query", () => {
    expect(filterCommandTools("", tools)).toHaveLength(2);
  });

  it("filters by label", () => {
    expect(filterCommandTools("win", tools).map((t) => t.id)).toEqual(["wind"]);
  });
});
