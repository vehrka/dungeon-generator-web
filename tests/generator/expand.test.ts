import { describe, expect, it } from "vitest";
import { defaultGeneratorConfig } from "../../src/engine/generator/config";
import { expand } from "../../src/engine/generator/expand";
import { PRESETS } from "../../src/engine/generator/grammar";
import { progress, reachable, unsolvableReasons } from "../../src/engine/generator/solve";
import { THEMES } from "../../src/engine/generator/themes";
import type { DGraph } from "../../src/engine/generator/types";

const seeds = Array.from({ length: 100 }, (_, i) => i + 1);
const dump = (g: DGraph) => JSON.stringify([g.vertices(), g.edges()]);
const pickups = (g: DGraph) => g.vertices().filter(([, v]) => !v.gate && v.objects.length);

describe("expand", () => {
  it("same seed gives the same graph", () => {
    const a = expand(42, "L", THEMES.zelda, defaultGeneratorConfig);
    expect(dump(expand(42, "L", THEMES.zelda, defaultGeneratorConfig))).toBe(dump(a));
    expect(dump(expand(43, "L", THEMES.zelda, defaultGeneratorConfig))).not.toBe(dump(a));
  });

  it.each(PRESETS)("%s: no non-terminal left, solvable, every pickup reachable", (preset) => {
    for (const seed of seeds) {
      const g = expand(seed, preset, THEMES.zelda, defaultGeneratorConfig);
      expect(g.vertices().some(([, v]) => v.nt), `seed ${seed}`).toBe(false);
      expect(unsolvableReasons(g), `seed ${seed}`).toEqual([]);
      const reached = reachable(g);
      for (const [id] of pickups(g)) expect(reached.has(id), `seed ${seed} pickup ${id}`).toBe(true);
    }
  });

  it("limits trigger the finish and every key is still placed", () => {
    const tight = { ...defaultGeneratorConfig, maxNodes: 10, maxIter: 3 };
    for (const seed of seeds) {
      const g = expand(seed, "L", THEMES.zelda, tight);
      expect(g.vertices().some(([, v]) => v.nt), `seed ${seed}`).toBe(false);
      expect(g.vertices().some(([, v]) => v.type === "eb"), `seed ${seed}`).toBe(true);
      expect(unsolvableReasons(g), `seed ${seed}`).toEqual([]);
      const needed = g.vertices().flatMap(([, v]) => (v.gate ? v.objects.map((o) => o.id) : []));
      const found = new Set(pickups(g).flatMap(([, v]) => v.objects.map((o) => o.id)));
      for (const id of needed) expect(found.has(id), `seed ${seed} ${id}`).toBe(true);
    }
    const sizes = (config: typeof tight) => seeds.reduce((n, seed) => n + expand(seed, "L", THEMES.zelda, config).vertexCount, 0);
    expect(sizes(tight)).toBeLessThan(sizes(defaultGeneratorConfig));
  });

  it("paced rooms get harder", () => {
    const [early, late] = [[], []] as [string[], string[]];
    for (const seed of Array.from({ length: 300 }, (_, i) => i + 1)) {
      const g = expand(seed, "L", THEMES.zelda, defaultGeneratorConfig);
      for (const [id, v] of g.vertices()) if (["n", "e", "t", "p", "c"].includes(v.type)) (progress(g, id) > 2 / 3 ? late : early).push(v.type);
    }
    const share = (types: string[], of: string) => types.filter((t) => of.includes(t)).length / types.length;
    expect(share(late, "tc")).toBeGreaterThan(share(early, "tc"));
    expect(share(late, "c")).toBeGreaterThan(share(early, "c"));
  });

  it("theme changes text only", () => {
    const shape = (g: DGraph) => JSON.stringify([g.vertices().map(([id, v]) => [id, v.type.startsWith("gb: ") ? "gb" : v.type, v.gate, v.objects.map((o) => o.id)]), g.edges()]);
    for (const seed of seeds.slice(0, 20)) {
      const zelda = expand(seed, "M", THEMES.zelda, defaultGeneratorConfig);
      const cyber = expand(seed, "M", THEMES.cyber, defaultGeneratorConfig);
      expect(shape(cyber), `seed ${seed}`).toBe(shape(zelda));
    }
    const names = expand(1, "L", THEMES.cyber, defaultGeneratorConfig).vertices().map(([, v]) => v.name);
    expect(names).toContain("Get root key 1");
  });

  it("names objects by type count and ids by type", () => {
    const g = expand(7, "L", THEMES.zelda, defaultGeneratorConfig);
    const objects = [...new Map(g.vertices().flatMap(([, v]) => v.objects.map((o) => [o.id, o]))).values()];
    for (const o of objects) expect(o.name.endsWith(` ${o.id.split("-").at(-1)}`), o.id).toBe(true);
    expect(objects.map((o) => o.id)).toContain("bosskey-1");
  });
});
