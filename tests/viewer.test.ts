import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isSeed, maxSeed } from "../src/engine/rng";
import { defaultConfig } from "../src/engine/config";
import { LayoutError } from "../src/engine/layout";
import { layoutCache, panelFor, dungeonName, exportName, jsonName, keyName, layoutConfig, layoutFailed, load, parseSeed, randomSeed, parseSize, parseStyle, parseTheme } from "../src/viewer/state";

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
    expect(panelFor({ ...json, seed: 7, size: "m", theme: "Zelda" })).toEqual({ seed: 7, size: "M", theme: "zelda" });
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
    for (const t of ["zelda", "cyber"]) expect(parseTheme(t)).toBe(t);
  });

  it("rejects anything else", () => {
    for (const t of ["", "Zelda", "toString", "__proto__"]) expect(() => parseTheme(t)).toThrow(/^Unknown theme/);
  });
});

describe("parseStyle", () => {
  it("accepts the map styles", () => {
    for (const s of ["plain", "dyson", "neon"]) expect(parseStyle(s)).toBe(s);
  });

  it("rejects anything else", () => {
    for (const s of ["", "Dyson", "toString", "__proto__"]) expect(() => parseStyle(s)).toThrow(/^Unknown style .*, expected one of plain dyson neon$/);
  });
});

describe("names", () => {
  it("names a generated dungeon as the CLI", () => {
    expect(dungeonName({ seed: 7, size: "M", theme: "zelda" })).toBe("m-7-zelda");
    expect(dungeonName({ seed: 0, size: "XS", theme: "cyber" })).toBe("xs-0-cyber");
  });

  it("names the JSON and key exports", () => {
    expect(jsonName("m-7-zelda")).toBe("m-7-zelda.json");
    expect(keyName("m-7-zelda")).toBe("m-7-zelda-key.md");
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
    expect(exportName("m-7-zelda", 7, "dyson")).toBe("m-7-zelda-map-7-dyson.svg");
    expect(exportName("m-7-cyber", 7, "neon")).toBe("m-7-cyber-map-7-neon.svg");
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

describe("layoutCache", () => {
  const json = JSON.parse(text);
  const catchIt = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      return e;
    }
  };

  it("reuses the last layout for the same dungeon, seed and config", () => {
    const place = layoutCache();
    const a = place(json, 3, defaultConfig);
    expect(place(structuredClone(json), 3, defaultConfig)).toBe(a); // the worker gets a copy each time
    expect(place(json, 4, defaultConfig)).not.toBe(a);
    expect(place(json, 3, layoutConfig(false))).not.toBe(place(json, 3, defaultConfig));
  });

  it("keeps a layout failure, so a style change does not run it again", () => {
    const place = layoutCache();
    const stuck = { ...defaultConfig, maxTotalIterations: 1 };
    const e = catchIt(() => place(json, 1, stuck));
    expect(e).toBeInstanceOf(LayoutError);
    expect(catchIt(() => place(json, 1, stuck))).toBe(e);
  });

  it("tries any other error again", () => {
    const place = layoutCache();
    const bad = { ...json, schema_version: 3 };
    const e = catchIt(() => place(bad, 1, defaultConfig));
    expect(e).toBeInstanceOf(Error);
    expect(catchIt(() => place(bad, 1, defaultConfig))).not.toBe(e);
  });
});

describe("layoutConfig", () => {
  it("is the default config with corridors on or off", () => {
    expect(layoutConfig(true)).toEqual(defaultConfig);
    expect(layoutConfig(false)).toEqual({ ...defaultConfig, corridors: false });
  });
});
