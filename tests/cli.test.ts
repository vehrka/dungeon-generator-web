import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main, parseCli, parseGrammar } from "../src/cli/main";
import { drawGraph } from "../src/render/graph";

const fixture = join(import.meta.dirname, "fixtures", "ruin.json");
const tmp = () => mkdtempSync(join(tmpdir(), "dlh-"));

describe("parseCli", () => {
  it("defaults the output next to the input and the layout seed to the dungeon's", () => {
    expect(parseCli(["dir/ruin.json"])).toEqual({ source: { input: "dir/ruin.json" }, output: "dir/ruin-map.svg", layoutSeed: undefined, corridors: true });
  });

  it("takes an output and a layout seed", () => {
    expect(parseCli(["ruin.json", "-o", "x.png", "--layout-seed", "12"])).toEqual({ source: { input: "ruin.json" }, output: "x.png", layoutSeed: 12, corridors: true });
  });

  it("turns corridors off", () => {
    expect(parseCli(["ruin.json", "--no-corridors"]).corridors).toBe(false);
  });

  it("rejects bad arguments", () => {
    expect(() => parseCli([])).toThrow(/input/);
    expect(() => parseCli(["a.json", "b.json"])).toThrow(/one input/);
    expect(() => parseCli(["a.json", "--layout-seed", "x"])).toThrow(/layout-seed/);
    expect(() => parseCli(["a.json", "--layout-seed", "4294967296"])).toThrow(/layout-seed/);
    expect(parseCli(["a.json", "--layout-seed", "4294967295"]).layoutSeed).toBe(4294967295);
    expect(() => parseCli(["a.json", "-o", "a.jpg"])).toThrow(/\.svg or \.png/);
    expect(() => parseCli(["a.json", "--corridors"])).toThrow();
  });

  it("generates with size M and theme zelda by default, output named after them", () => {
    expect(parseCli(["--dungeon-seed", "7"])).toEqual({
      source: { generate: { seed: 7, size: "M", theme: "zelda" } },
      output: "m-7-zelda-map.svg",
      layoutSeed: undefined,
      corridors: true,
    });
  });

  it("takes size in any case, theme, JSON and key outputs", () => {
    const args = parseCli(["--dungeon-seed", "3", "--size", "xs", "--theme", "cyber", "--json", "d.json", "--key", "d.md", "--layout-seed", "2"]);
    expect(args).toEqual({ source: { generate: { seed: 3, size: "XS", theme: "cyber" } }, output: "xs-3-cyber-map.svg", json: "d.json", key: "d.md", layoutSeed: 2, corridors: true });
  });

  it("takes a key for a loaded file", () => {
    expect(parseCli(["ruin.json", "--key", "ruin.md"]).key).toBe("ruin.md");
  });

  it("rejects bad generate arguments", () => {
    expect(() => parseCli(["--dungeon-seed", "x"])).toThrow(/dungeon-seed/);
    expect(() => parseCli(["--dungeon-seed", "-1"])).toThrow();
    expect(() => parseCli(["--dungeon-seed", "1", "--size", "XL"])).toThrow(/size XL/);
    expect(() => parseCli(["--dungeon-seed", "1", "--theme", "spam"])).toThrow(/theme spam/);
    expect(() => parseCli(["a.json", "--dungeon-seed", "1"])).toThrow(/not both/);
    expect(() => parseCli(["--size", "M"])).toThrow(/--size needs --dungeon-seed/);
    expect(() => parseCli(["a.json", "--theme", "cyber"])).toThrow(/--theme needs --dungeon-seed/);
    expect(() => parseCli(["a.json", "--json", "b.json"])).toThrow(/--json needs --dungeon-seed/);
  });
});

describe("main", () => {
  const quiet = { log: () => {}, error: () => {} };

  it("writes an svg", async () => {
    const out = join(tmp(), "map.svg");
    expect(await main([fixture, "-o", out], quiet)).toBe(0);
    expect(readFileSync(out, "utf8")).toMatch(/^<svg /);
  });

  it("writes a map without corridors", async () => {
    const [on, off] = [join(tmp(), "on.svg"), join(tmp(), "off.svg")];
    expect(await main([fixture, "-o", on, "--style", "plain"], quiet)).toBe(0);
    expect(await main([fixture, "-o", off, "--no-corridors", "--style", "plain"], quiet)).toBe(0);
    expect(readFileSync(on, "utf8")).toContain('class="corridor"');
    expect(readFileSync(off, "utf8")).not.toContain('class="corridor"');
  });

  it("draws neon for cyber, Dyson for zelda, plain for any other theme, unless --style says otherwise", async () => {
    const dir = tmp();
    const svg = async (...args: string[]) => {
      const out = join(dir, "s.svg");
      expect(await main([...args, "-o", out], quiet)).toBe(0);
      return readFileSync(out, "utf8");
    };
    expect(await svg(fixture)).toContain('class="room"');
    expect(await svg(fixture, "--style", "dyson")).toContain('class="hatch"');
    expect(await svg("--dungeon-seed", "1", "--size", "s", "--theme", "zelda")).toContain('class="hatch"');
    expect(await svg("--dungeon-seed", "1", "--size", "s", "--theme", "cyber")).toContain('fill="#0b0814"');
    expect(await svg("--dungeon-seed", "1", "--size", "s", "--theme", "plain")).toContain('class="room"');
    expect(await svg("--dungeon-seed", "1", "--size", "s", "--theme", "cyber", "--style", "dyson")).toContain('class="hatch"');
  });

  it("writes a Dyson png and a neon png", async () => {
    for (const style of ["dyson", "neon"]) {
      const out = join(tmp(), `${style}.png`);
      expect(await main([fixture, "-o", out, "--style", style], quiet)).toBe(0);
      expect(readFileSync(out).subarray(1, 4).toString()).toBe("PNG");
    }
  }, 30_000);

  it("writes a png", async () => {
    const out = join(tmp(), "map.png");
    expect(await main([fixture, "-o", out, "--layout-seed", "3"], quiet)).toBe(0);
    expect(readFileSync(out).subarray(1, 4).toString()).toBe("PNG");
  }, 20_000);

  it("generates a dungeon: svg, JSON and key", async () => {
    const dir = tmp();
    const [svg, json, key] = [join(dir, "m.svg"), join(dir, "m.json"), join(dir, "m.md")];
    const logs: string[] = [];
    expect(await main(["--dungeon-seed", "7", "-o", svg, "--json", json, "--key", key], { ...quiet, log: (m: string) => logs.push(m) })).toBe(0);
    expect(readFileSync(svg, "utf8")).toMatch(/^<svg /);
    const data = JSON.parse(readFileSync(json, "utf8"));
    expect([data.schema_version, data.seed, data.size, data.theme]).toEqual([2, 7, "M", "zelda"]);
    expect(readFileSync(key, "utf8")).toMatch(/^# GM key: Combined dungeon\n\nSeed 7 · size M · theme zelda · \d+ rooms · solvable\n/);
    expect(logs).toEqual([expect.stringMatching(/^.*m\.svg \(\d+ rooms, dungeon seed 7, size M, theme zelda, layout seed 7\)$/)]);
  });

  it("generates the same files from the same arguments", async () => {
    const run = async () => {
      const dir = tmp();
      const files = ["m.svg", "m.json", "m.md"].map((f) => join(dir, f));
      expect(await main(["--dungeon-seed", "5", "--size", "s", "--theme", "cyber", "-o", files[0]!, "--json", files[1]!, "--key", files[2]!], quiet)).toBe(0);
      return files.map((f) => readFileSync(f, "utf8"));
    };
    expect(await run()).toEqual(await run());
  });

  it("writes the key of a loaded file", async () => {
    const dir = tmp();
    const key = join(dir, "ruin.md");
    expect(await main([fixture, "-o", join(dir, "m.svg"), "--key", key], quiet)).toBe(0);
    expect(readFileSync(key, "utf8")).toBe(readFileSync(join(import.meta.dirname, "fixtures", "ruin-key.md"), "utf8"));
  });

  it("validates a loaded JSON before writing its key", async () => {
    const json = JSON.parse(readFileSync(fixture, "utf8"));
    json.edges.push({ source: 0, target: 999, oneway: false });
    const dir = tmp();
    const [bad, key] = [join(dir, "bad.json"), join(dir, "bad.md")];
    writeFileSync(bad, JSON.stringify(json));
    const errors: string[] = [];
    expect(await main([bad, "--key", key], { ...quiet, error: (m: string) => errors.push(m) })).toBe(1);
    expect(errors).toEqual(["Edge 0 → 999 refers to unknown node 999"]);
    expect(existsSync(key)).toBe(false);
  });

  it("takes a style in any case, rejects others", () => {
    expect(parseCli(["a.json", "--style", "Dyson"]).style).toBe("dyson");
    expect(parseCli(["a.json", "--style", "plain"]).style).toBe("plain");
    expect(parseCli(["a.json"]).style).toBeUndefined();
    expect(parseCli(["a.json", "--style", "NEON"]).style).toBe("neon");
    expect(() => parseCli(["a.json", "--style", "ink"])).toThrow("Unknown style ink, expected one of plain dyson neon");
  });

  it("takes a graph output, rejects one that is not .svg", () => {
    expect(parseCli(["a.json", "--graph", "g.svg"]).graph).toBe("g.svg");
    expect(parseCli(["--dungeon-seed", "1", "--graph", "G.SVG"]).graph).toBe("G.SVG");
    expect(parseCli(["a.json"]).graph).toBeUndefined();
    expect(() => parseCli(["a.json", "--graph", "g.png"])).toThrow("--graph must end in .svg: g.png");
  });

  it("writes the graph, also when the dungeon does not lay out", async () => {
    const dir = tmp();
    const graph = join(dir, "ruin-graph.svg");
    expect(await main([fixture, "-o", join(dir, "m.svg"), "--graph", graph], quiet)).toBe(0);
    expect(readFileSync(graph, "utf8")).toBe(drawGraph(JSON.parse(readFileSync(fixture, "utf8"))).svg);
    // K5 of rooms: not planar, so no map.
    const json = JSON.parse(readFileSync(fixture, "utf8"));
    const ids = json.nodes.filter((n: { kind: string }) => n.kind === "room").slice(0, 5).map((n: { id: number }) => n.id);
    for (const a of ids) for (const b of ids) if (a < b) json.edges.push({ source: a, target: b, oneway: false });
    const [bad, badGraph, badMap] = [join(dir, "k5.json"), join(dir, "k5-graph.svg"), join(dir, "k5.svg")];
    writeFileSync(bad, JSON.stringify(json));
    expect(await main([bad, "-o", badMap, "--graph", badGraph], quiet)).toBe(1);
    expect(readFileSync(badGraph, "utf8")).toMatch(/^<svg /);
    expect(existsSync(badMap)).toBe(false);
  });

  it("takes a grammar sheet output alone, rejects one that is not .svg", () => {
    expect(parseGrammar(["--grammar", "docs/grammar.svg"])).toBe("docs/grammar.svg");
    expect(parseGrammar(["a.json"])).toBeUndefined();
    expect(() => parseGrammar(["--grammar", "g.png"])).toThrow("--grammar must end in .svg: g.png");
    expect(() => parseGrammar(["--grammar", "g.svg", "--size", "M"])).toThrow(/size/);
    expect(() => parseGrammar(["a.json", "--grammar", "g.svg"])).toThrow(/a\.json/);
  });

  it("writes the grammar sheet", async () => {
    const sheet = join(tmp(), "grammar.svg");
    expect(await main(["--grammar", sheet], quiet)).toBe(0);
    expect(readFileSync(sheet, "utf8")).toMatch(/^<svg [^]*Combined dungeon grammar/);
  });

  it("takes the theme in any case", () => {
    expect(parseCli(["--dungeon-seed", "1", "--theme", "Cyber"]).source).toEqual({ generate: { seed: 1, size: "M", theme: "cyber" } });
  });

  it("prints the error and exits 1 without a stack", async () => {
    const dir = tmp();
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ schema_version: 3, seed: 1 }));
    const errors: string[] = [];
    expect(await main([bad], { ...quiet, error: (m: string) => errors.push(m) })).toBe(1);
    expect(errors).toEqual(["Unsupported schema_version 3, expected 2"]);
  });

  it("rejects a dungeon without a usable seed when no layout seed is given", async () => {
    const json = JSON.parse(readFileSync(fixture, "utf8"));
    delete json.seed;
    const bad = join(tmp(), "noseed.json");
    writeFileSync(bad, JSON.stringify(json));
    const errors: string[] = [];
    expect(await main([bad], { ...quiet, error: (m: string) => errors.push(m) })).toBe(1);
    expect(errors[0]).toMatch(/seed/);
    expect(await main([bad, "-o", join(tmp(), "m.svg"), "--layout-seed", "2"], quiet)).toBe(0);
  });
});
