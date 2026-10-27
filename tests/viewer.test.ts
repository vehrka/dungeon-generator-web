import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSeed, maxSeed } from "../src/engine/rng";
import { defaultConfig } from "../src/engine/config";
import { dungeonName, exportName, jsonName, keyName, layoutConfig, load, parseSeed, randomSeed, parseSize, parseTheme } from "../src/viewer/state";

const text = readFileSync(join(import.meta.dirname, "fixtures", "ruin.json"), "utf8");

describe("load", () => {
  it("names the dungeon after the file without .json", () => {
    expect(load(text, "ruin.json").name).toBe("ruin");
    expect(load(text, "Ruin.JSON").name).toBe("Ruin");
    expect(load(text, "ruin").name).toBe("ruin");
  });

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

describe("randomSeed", () => {
  it("draws seeds over the whole range", () => {
    const seeds = Array.from({ length: 50 }, () => randomSeed());
    for (const s of seeds) expect(isSeed(s)).toBe(true);
    expect(new Set(seeds).size).toBeGreaterThan(45);
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
      expect(() => parseSeed(s)).toThrow(/^Layout seed must be an integer from 0 to 4294967295/);
    }
  });

  it("names the dungeon seed", () => {
    expect(() => parseSeed("", "Dungeon seed")).toThrow(/^Dungeon seed must be an integer from 0 to 4294967295: $/);
  });
});

describe("parseSize", () => {
  it("accepts the generator sizes", () => {
    for (const s of ["XS", "S", "M", "L"]) expect(parseSize(s)).toBe(s);
  });

  it("rejects anything else", () => {
    for (const s of ["", "m", "XL", "toString"]) expect(() => parseSize(s)).toThrow(/^Unknown size/);
  });
});

describe("parseTheme", () => {
  it("accepts the generator themes", () => {
    for (const t of ["zelda", "cyber", "tor-barrow", "tor-dwarf"]) expect(parseTheme(t)).toBe(t);
  });

  it("rejects anything else", () => {
    for (const t of ["", "Zelda", "toString", "__proto__"]) expect(() => parseTheme(t)).toThrow(/^Unknown theme/);
  });
});

describe("names", () => {
  it("names a generated dungeon as the CLI", () => {
    expect(dungeonName({ seed: 7, size: "M", theme: "zelda" })).toBe("m-7-zelda");
    expect(dungeonName({ seed: 0, size: "XS", theme: "tor-dwarf" })).toBe("xs-0-tor-dwarf");
  });

  it("names the JSON and key exports", () => {
    expect(jsonName("m-7-zelda")).toBe("m-7-zelda.json");
    expect(keyName("m-7-zelda")).toBe("m-7-zelda-key.md");
    expect(keyName("ruin")).toBe("ruin-key.md");
  });
});

describe("exportName", () => {
  it("puts the seed in the name", () => {
    expect(exportName("ruin", 12)).toBe("ruin-map-12.svg");
    expect(exportName("m-7-zelda", 7)).toBe("m-7-zelda-map-7.svg");
    expect(exportName("dungeon", 0)).toBe("dungeon-map-0.svg");
  });
});

describe("layoutConfig", () => {
  it("is the default config with corridors on or off", () => {
    expect(layoutConfig(true)).toEqual(defaultConfig);
    expect(layoutConfig(false)).toEqual({ ...defaultConfig, corridors: false });
  });
});
