import { describe, expect, it } from "vitest";
import { parseSeriesString, pickSeries } from "../open-library";

describe("parseSeriesString", () => {
  it.each([
    ["Harry Potter, #1", "Harry Potter", 1],
    ["Discworld (3)", "Discworld", 3],
    ["Discworld #3", "Discworld", 3],
    ["The Expanse ; 2", "The Expanse", 2],
    ["Foundation (Book 1)", "Foundation", 1],
    ["Dune Chronicles, Book 2", "Dune Chronicles", 2],
    ["Wheel of Time -- 5", "Wheel of Time", 5],
    ["A Song of Ice and Fire, #3.5", "A Song of Ice and Fire", 3.5],
    ["Book 1 of Foundation", "Foundation", 1],
    ["The Witcher, Vol. 4", "The Witcher", 4],
  ])("parses %s", (raw, name, position) => {
    expect(parseSeriesString(raw)).toEqual({ name, position });
  });

  it("keeps a plain series name without a position", () => {
    expect(parseSeriesString("Discworld")).toEqual({
      name: "Discworld",
      position: null,
    });
  });

  it("does not treat a number inside a title as a position", () => {
    expect(parseSeriesString("Fahrenheit 451")).toEqual({
      name: "Fahrenheit 451",
      position: null,
    });
  });

  it("returns null for blank input", () => {
    expect(parseSeriesString("   ")).toBeNull();
  });
});

describe("pickSeries", () => {
  it("prefers an entry that carries a position", () => {
    expect(pickSeries(["Discworld", "Discworld (3)"])).toEqual({
      name: "Discworld",
      position: 3,
    });
  });

  it("falls back to the first entry", () => {
    expect(pickSeries(["Discworld", "Witches"])).toEqual({
      name: "Discworld",
      position: null,
    });
  });

  it("handles missing lists", () => {
    expect(pickSeries(undefined)).toBeNull();
    expect(pickSeries([])).toBeNull();
  });
});
