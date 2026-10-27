import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { maxSeed } from "../src/engine/rng";
import { defaultConfig } from "../src/engine/config";
import { exportName, layoutConfig, load, parseSeed, reroll } from "../src/viewer/state";

const text = readFileSync(join(import.meta.dirname, "fixtures", "ruin.json"), "utf8");

describe("load", () => {
  it("takes the layout seed from the dungeon", () => {
    const { json, seed } = load(text, "ruin.json");
    expect(seed).toBe(json.seed);
    expect(seed).toBeTypeOf("number");
  });

  it("leaves the seed empty when the dungeon has no usable one", () => {
    const json = JSON.parse(text);
    json.seed = -4;
    expect(load(JSON.stringify(json), "ruin.json").seed).toBeUndefined();
  });

  it("names the file when it is not JSON", () => {
    expect(() => load("{nope", "ruin.json")).toThrow(/^ruin\.json is not JSON$/);
  });

  it("names the file when the JSON is not an object", () => {
    for (const t of ["null", "[]", "3", '"x"']) expect(() => load(t, "ruin.json")).toThrow(/^ruin\.json is not a dungeon JSON object$/);
  });
});

describe("reroll", () => {
  it("steps the seed and wraps at the maximum", () => {
    expect(reroll(7)).toBe(8);
    expect(reroll(maxSeed)).toBe(0);
  });
});

describe("parseSeed", () => {
  it("accepts integers from 0 to the maximum", () => {
    expect(parseSeed("0")).toBe(0);
    expect(parseSeed(" 42 ")).toBe(42);
    expect(parseSeed(String(maxSeed))).toBe(maxSeed);
  });

  it("rejects anything else", () => {
    for (const s of ["", "-1", "1.5", "1e3", "x", String(maxSeed + 1)]) {
      expect(() => parseSeed(s)).toThrow(/integer from 0 to 4294967295/);
    }
  });
});

describe("exportName", () => {
  it("puts the seed in the name", () => {
    expect(exportName("ruin.json", 12)).toBe("ruin-map-12.svg");
    expect(exportName("dungeon", 0)).toBe("dungeon-map-0.svg");
  });
});

describe("layoutConfig", () => {
  it("is the default config with corridors on or off", () => {
    expect(layoutConfig(true)).toEqual(defaultConfig);
    expect(layoutConfig(false)).toEqual({ ...defaultConfig, corridors: false });
  });
});
