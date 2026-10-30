import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSeed, maxSeed } from "../src/engine/rng";
import { defaultConfig } from "../src/engine/config";
import { panelFor, dungeonName, exportName, graphName, jsonName, keyName, layoutConfig, layoutFailed, load, parseSeed, randomSeed, parseSize, parseTheme, styleOf } from "../src/viewer/state";

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

describe("panelFor", () => {
  const json = JSON.parse(text);

  it("fills the dungeon panel from the file", () => {
    expect(panelFor({ ...json, seed: 444, size: "L", theme: "cyber" })).toEqual({ seed: 444, size: "L", theme: "cyber" });
  });

  it("reads size and theme in any case", () => {
    expect(panelFor({ ...json, seed: 7, size: "m", theme: "Classic" })).toEqual({ seed: 7, size: "M", theme: "classic" });
  });

  it("leaves out what the generator does not take", () => {
    expect(panelFor({ ...json, seed: -4, size: "XL", theme: "tor-barrow" })).toEqual({});
    expect(panelFor({ ...json, seed: 1.5, size: 3, theme: "toString" })).toEqual({});
    const { size, theme, ...bare } = json;
    expect(panelFor({ ...bare, seed: 0 })).toEqual({ seed: 0 });
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
    for (const t of ["classic", "cyber", "plain"]) expect(parseTheme(t)).toBe(t);
  });

  it("rejects anything else", () => {
    for (const t of ["", "Classic", "toString", "__proto__"]) expect(() => parseTheme(t)).toThrow(/^Unknown theme/);
  });
});

describe("styleOf", () => {
  it("draws a dungeon in its theme's style", () => {
    expect(styleOf("classic")).toBe("dyson");
    expect(styleOf("Cyber")).toBe("neon");
    expect(styleOf("plain")).toBe("plain");
  });

  it("draws any other theme, or one that is not a string, plain", () => {
    for (const t of ["tor-barrow", "", undefined, 5, null, {}]) expect(styleOf(t)).toBe("plain");
  });
});

describe("names", () => {
  it("names a generated dungeon as the CLI", () => {
    expect(dungeonName({ seed: 7, size: "M", theme: "classic" })).toBe("m-7-classic");
    expect(dungeonName({ seed: 0, size: "XS", theme: "cyber" })).toBe("xs-0-cyber");
  });

  it("names the JSON and key exports", () => {
    expect(jsonName("m-7-classic")).toBe("m-7-classic.json");
    expect(keyName("m-7-classic")).toBe("m-7-classic-key.md");
    expect(keyName("ruin")).toBe("ruin-key.md");
  });
});

describe("exportName", () => {
  it("puts the seed in the name", () => {
    expect(exportName("ruin", 12, "plain")).toBe("ruin-map-12.svg");
    expect(exportName("m-7-cyber", 7, "plain")).toBe("m-7-cyber-map-7.svg");
    expect(exportName("dungeon", 0, "plain")).toBe("dungeon-map-0.svg");
  });

  it("names any style but plain", () => {
    expect(exportName("m-7-classic", 7, "dyson")).toBe("m-7-classic-map-7-dyson.svg");
    expect(exportName("m-7-cyber", 7, "neon")).toBe("m-7-cyber-map-7-neon.svg");
  });
});

describe("graphName", () => {
  it("names the graph without a layout seed or style", () => {
    expect(graphName("m-7-classic")).toBe("m-7-classic-graph.svg");
    expect(graphName("ruin")).toBe("ruin-graph.svg");
  });
});

describe("layoutFailed", () => {
  it("says no layout was found and what to change, then the stuck rooms", () => {
    expect(layoutFailed([23, 18, 21], true)).toEqual([
      "No layout could be completed for this dungeon.",
      "Try another layout seed (reroll), or another dungeon seed or size.",
      "Stuck on rooms 23, 18, 21.",
    ]);
  });

  it("suggests only the layout seed for a loaded file", () => {
    expect(layoutFailed([4], false)[1]).toBe("Try another layout seed (reroll).");
  });
});

describe("layoutConfig", () => {
  it("is the default config with corridors on or off", () => {
    expect(layoutConfig(true)).toEqual(defaultConfig);
    expect(layoutConfig(false)).toEqual({ ...defaultConfig, corridors: false });
  });
});
