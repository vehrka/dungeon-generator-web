import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { normalize } from "../src/engine/normalize";
import { rng, randInt } from "../src/engine/rng";
import { sizeRule } from "../src/engine/shapeRules";
import { corridorShapes, poolId, poolKey, poolKeys, shapePool, type ShapePool } from "../src/engine/shapes";
import { doorLines } from "../src/engine/doors";
import { defaultConfig } from "../src/engine/config";
import { bbox, polygon, rectangle, segment, walls, type Point } from "../src/engine/geometry";
import type { DungeonJson } from "../src/engine/types";

const p = (x: number, y: number): Point => ({ x, y });

describe("rng", () => {
  it("is deterministic per seed and stream", () => {
    const draw = (seed: number, stream?: string) => {
      const r = rng(seed, stream);
      return Array.from({ length: 5 }, r);
    };
    expect(draw(1)).toEqual(draw(1));
    expect(draw(1)).not.toEqual(draw(2));
    expect(draw(1, "rect/n")).not.toEqual(draw(1, "rect/e"));
    for (const x of draw(7)) expect(x >= 0 && x < 1).toBe(true);
  });

  it("draws integers in a closed range, all values reachable", () => {
    const r = rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = randInt(r, 4, 7);
      expect(v >= 4 && v <= 7 && Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([4, 5, 6, 7]);
  });
});

describe("sizeRule", () => {
  it("looks up types, bonus goals by prefix, unknown types by fallback", () => {
    expect(sizeRule("item")).toEqual({ min: 3, max: 5 });
    expect(sizeRule("eb")).toEqual({ min: 7, max: 10 });
    expect(sizeRule("gb: treasure points")).toEqual(sizeRule("gb"));
    expect(sizeRule("whatever")).toEqual(sizeRule("n"));
  });

  it("grows both bounds per neighbour above hubDegree", () => {
    expect(sizeRule("n", 3, 1)).toEqual({ min: 7, max: 10 });
    expect(sizeRule("n", 3, 2)).toEqual({ min: 10, max: 13 });
    expect(sizeRule("gb: treasure points", 1, 1)).toEqual({ min: 7, max: 10 });
  });

  it("reads no hub count out of the type", () => {
    expect(sizeRule("gb: sword +1", 0, 1)).toEqual(sizeRule("gb"));
  });
});

const key = (type: string, extra = 0) => ({ type, extra });

describe("poolKey", () => {
  it("counts only neighbours above hubDegree", () => {
    expect(poolKey("n", 1, defaultConfig)).toEqual(key("n"));
    expect(poolKey("n", 4, defaultConfig)).toEqual(key("n"));
    expect(poolKey("n", 7, defaultConfig)).toEqual(key("n", 3));
    expect(poolKey("n", 7, { ...defaultConfig, hubDegree: 6 })).toEqual(key("n", 1));
  });

  it("gives distinct ids to a hub and a type that looks like one", () => {
    expect(poolId(key("gb: x", 1))).not.toBe(poolId(key("gb: x+1")));
    const pool = shapePool([key("gb: x", 1), key("gb: x+1")], 444, defaultConfig);
    expect(pool.size).toBe(2);
    expect(pool.get(poolId(key("gb: x+1")))).toEqual(shapePool([key("gb: x+1")], 444, defaultConfig).get(poolId(key("gb: x+1"))));
  });

  it("counts distinct neighbours, not doors or self-loops", () => {
    const g = normalize(ruin as DungeonJson);
    const keys = poolKeys(g, { ...defaultConfig, hubDegree: 1 });
    const neighbours = (id: number) =>
      new Set(g.doors.flatMap(({ a, b }) => (a === b ? [] : a === id ? [b] : b === id ? [a] : []))).size;
    for (const [id, room] of g.rooms) expect(keys.get(id)).toEqual(poolKey(room.type, neighbours(id), { ...defaultConfig, hubDegree: 1 }));
  });
});

describe("shapePool", () => {
  const graph = normalize(ruin as DungeonJson);
  const types = [...new Set([...graph.rooms.values()].map((r) => r.type))];
  const keys = types.map((t) => key(t));
  const get = (pool: ShapePool, type: string, extra = 0) => pool.get(poolId(key(type, extra)));

  it("has rectangles within the size rule for every room type", () => {
    const pool = shapePool(keys, 444, defaultConfig);
    expect([...pool.keys()].sort()).toEqual(keys.map(poolId).sort());
    for (const type of types) {
      const shapes = get(pool, type)!;
      const { min, max } = sizeRule(type);
      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes.length).toBeLessThanOrEqual(defaultConfig.shapesPerType);
      expect(new Set(shapes.map((s) => s.id)).size).toBe(shapes.length);
      for (const s of shapes) {
        const b = bbox(s.outline);
        expect(s.outline).toHaveLength(4);
        expect([b.x1 - b.x0, b.y1 - b.y0].every((d) => d >= min && d <= max)).toBe(true);
        expect(s.id).toBe(`rect-${b.x1 - b.x0}x${b.y1 - b.y0}`);
      }
    }
  });

  it("gives the same pool for the same seed, a different one for another seed", () => {
    expect(shapePool(keys, 444, defaultConfig)).toEqual(shapePool(keys, 444, defaultConfig));
    expect(shapePool(keys, 444, defaultConfig)).not.toEqual(shapePool(keys, 445, defaultConfig));
  });

  it("does not change a type's shapes when other types come and go", () => {
    const alone = get(shapePool([key("n")], 444, defaultConfig), "n");
    expect(get(shapePool(keys, 444, defaultConfig), "n")).toEqual(alone);
  });

  it("keeps a type's shapes when hubs of it come and go, own shapes for hubs", () => {
    const pool = shapePool([key("n"), key("n", 3)], 444, defaultConfig);
    expect(get(pool, "n")).toEqual(get(shapePool([key("n")], 444, defaultConfig), "n"));
    const hub = get(pool, "n", 3)!;
    expect(hub.length).toBe(defaultConfig.shapesPerType);
    for (const s of hub) {
      const b = bbox(s.outline);
      expect([b.x1 - b.x0, b.y1 - b.y0].every((d) => d >= 7 && d <= 10)).toBe(true);
    }
    expect(shapePool([key("n", 3)], 444, defaultConfig)).toEqual(shapePool([key("n", 3)], 444, defaultConfig));
  });

  it("stops when the size range has fewer rectangles than asked", () => {
    const pool = shapePool([key("n")], 1, { ...defaultConfig, shapesPerType: 100 });
    expect(get(pool, "n")!.length).toBe(16); // 4..7 × 4..7
  });

  it("gives every wall of every shape a door line with the defaults", () => {
    for (const shapes of shapePool(keys, 444, defaultConfig).values()) {
      for (const s of shapes) expect(doorLines(s.outline, defaultConfig)).toHaveLength(4);
    }
  });
});

describe("doorLines", () => {
  const cfg = { doorLength: 1, cornerDistance: 1 };

  it("shrinks each wall to the door start positions", () => {
    expect(doorLines(rectangle(5, 3), cfg)).toEqual([
      { line: segment(p(1, 0), p(3, 0)), length: 1, normal: p(0, -1) },
      { line: segment(p(5, 1), p(5, 1)), length: 1, normal: p(1, 0) },
      { line: segment(p(1, 3), p(3, 3)), length: 1, normal: p(0, 1) },
      { line: segment(p(0, 1), p(0, 1)), length: 1, normal: p(-1, 0) },
    ]);
  });

  it("skips walls too short for a door away from the corners", () => {
    expect(doorLines(rectangle(2, 5), cfg).map((d) => d.normal)).toEqual([p(1, 0), p(-1, 0)]);
  });

  it("allows doors at the corners with cornerDistance 0", () => {
    const lines = doorLines(rectangle(2, 2), { doorLength: 2, cornerDistance: 0 });
    expect(lines.map((d) => d.line)).toEqual(walls(rectangle(2, 2)).map((w) => segment(w.from, w.from)));
  });

  it("keeps every door inside its wall, clear of the corners", () => {
    const L = polygon([p(0, 0), p(4, 0), p(4, 6), p(9, 6), p(9, 10), p(0, 10)]);
    const cfg2 = { doorLength: 2, cornerDistance: 1 };
    const ws = walls(L);
    const lines = doorLines(L, cfg2);
    expect(lines).toHaveLength(6);
    lines.forEach((d, i) => {
      const w = ws[i]!;
      const axis = w.from.y === w.to.y ? "x" : "y";
      expect(d.line.from[axis]).toBe(w.from[axis] + 1);
      expect(d.line.to[axis] + d.length).toBe(w.to[axis] - 1);
      expect(d.normal).toEqual(w.normal);
    });
  });
});

describe("corridorShapes", () => {
  it("has a vertical and a horizontal corridor per length, doorLength wide", () => {
    const shapes = corridorShapes({ ...defaultConfig, corridorLengths: [1, 3] });
    expect(shapes.map((s) => s.id)).toEqual(["corridor-v1", "corridor-h1", "corridor-v3", "corridor-h3"]);
    expect(shapes.map((s) => bbox(s.outline))).toEqual([
      { x0: 0, y0: 0, x1: 1, y1: 1 },
      { x0: 0, y0: 0, x1: 1, y1: 1 },
      { x0: 0, y0: 0, x1: 1, y1: 3 },
      { x0: 0, y0: 0, x1: 3, y1: 1 },
    ]);
  });

  it("has doors only on the two ends, even where cornerDistance would leave none", () => {
    const [v, h] = corridorShapes({ ...defaultConfig, cornerDistance: 1, corridorLengths: [3] });
    expect(v!.doorLines).toEqual([
      { line: segment(p(0, 0), p(0, 0)), length: 1, normal: p(0, -1) },
      { line: segment(p(0, 3), p(0, 3)), length: 1, normal: p(0, 1) },
    ]);
    expect(h!.doorLines!.map((d) => d.normal)).toEqual([p(1, 0), p(-1, 0)]);
  });
});
