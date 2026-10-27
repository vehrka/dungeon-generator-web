import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main, parseCli } from "../src/cli/main";

const fixture = join(import.meta.dirname, "fixtures", "ruin.json");
const tmp = () => mkdtempSync(join(tmpdir(), "dlh-"));

describe("parseCli", () => {
  it("defaults the output next to the input and the layout seed to the dungeon's", () => {
    expect(parseCli(["dir/ruin.json"])).toEqual({ input: "dir/ruin.json", output: "dir/ruin-map.svg", layoutSeed: undefined });
  });

  it("takes an output and a layout seed", () => {
    expect(parseCli(["ruin.json", "-o", "x.png", "--layout-seed", "12"])).toEqual({ input: "ruin.json", output: "x.png", layoutSeed: 12 });
  });

  it("rejects bad arguments", () => {
    expect(() => parseCli([])).toThrow(/input/);
    expect(() => parseCli(["a.json", "b.json"])).toThrow(/one input/);
    expect(() => parseCli(["a.json", "--layout-seed", "x"])).toThrow(/layout-seed/);
    expect(() => parseCli(["a.json", "-o", "a.jpg"])).toThrow(/\.svg or \.png/);
    expect(() => parseCli(["a.json", "--corridors"])).toThrow();
  });
});

describe("main", () => {
  const quiet = { log: () => {}, error: () => {} };

  it("writes an svg", async () => {
    const out = join(tmp(), "map.svg");
    expect(await main([fixture, "-o", out], quiet)).toBe(0);
    expect(readFileSync(out, "utf8")).toMatch(/^<svg /);
  });

  it("writes a png", async () => {
    const out = join(tmp(), "map.png");
    expect(await main([fixture, "-o", out, "--layout-seed", "3"], quiet)).toBe(0);
    expect(readFileSync(out).subarray(1, 4).toString()).toBe("PNG");
  }, 20_000);

  it("prints the error and exits 1 without a stack", async () => {
    const dir = tmp();
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ schema_version: 3 }));
    const errors: string[] = [];
    expect(await main([bad], { ...quiet, error: (m: string) => errors.push(m) })).toBe(1);
    expect(errors).toEqual(["Unsupported schema_version 3, expected 2"]);
  });
});
