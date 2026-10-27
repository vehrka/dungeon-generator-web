import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { normalize } from "../src/engine/normalize";
import { rng, randInt } from "../src/engine/rng";
import { sizeRule } from "../src/engine/shapeRules";
import { poolKey, poolKeys, shapePool } from "../src/engine/shapes";
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

  it("grows both bounds per door above hubDegree", () => {
    expect(sizeRule("n+3", 1)).toEqual({ min: 7, max: 10 });
    expect(sizeRule("n+3", 2)).toEqual({ min: 10, max: 13 });
    expect(sizeRule("gb: treasure points+1", 1)).toEqual({ min: 7, max: 10 });
  });
});

describe("poolKey", () => {
  it("is the type up to hubDegree doors, the type plus extra doors above", () => {
    expect(poolKey("n", 1, defaultConfig)).toBe("n");
    expect(poolKey("n", 4, defaultConfig)).toBe("n");
    expect(poolKey("n", 7, defaultConfig)).toBe("n+3");
    expect(poolKey("n", 7, { ...defaultConfig, hubDegree: 6 })).toBe("n+1");
  });

  it("counts distinct neighbours, not doors or self-loops", () => {
    const g = normalize(ruin as DungeonJson);
    const keys = poolKeys(g, { ...defaultConfig, hubDegree: 1 });
    const neighbours = (id: number) =>
      new Set(g.doors.flatMap(({ a, b }) => (a === b ? [] : a === id ? [b] : b === id ? [a] : []))).size;
    for (const [id, room] of g.rooms) expect(keys.get(id)).toBe(poolKey(room.type, neighbours(id), { ...defaultConfig, hubDegree: 1 }));
  });
});

describe("shapePool", () => {
  const graph = normalize(ruin as DungeonJson);
  const types = [...new Set([...graph.rooms.values()].map((r) => r.type))];

  it("has rectangles within the size rule for every room type", () => {
    const pool = shapePool(types, 444, defaultConfig);
    expect([...pool.keys()].sort()).toEqual([...types].sort());
    for (const [type, shapes] of pool) {
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
    expect(shapePool(types, 444, defaultConfig)).toEqual(shapePool(types, 444, defaultConfig));
    expect(shapePool(types, 444, defaultConfig)).not.toEqual(shapePool(types, 445, defaultConfig));
  });

  it("does not change a type's shapes when other types come and go", () => {
    const alone = shapePool(["n"], 444, defaultConfig).get("n");
    expect(shapePool(types, 444, defaultConfig).get("n")).toEqual(alone);
  });

  it("keeps today's shapes for rooms up to hubDegree, own shapes for hubs", () => {
    const pool = shapePool(["n", "n+3"], 444, defaultConfig);
    expect(pool.get("n")).toEqual(shapePool(["n"], 444, defaultConfig).get("n"));
    const hub = pool.get("n+3")!;
    expect(hub.length).toBe(defaultConfig.shapesPerType);
    for (const s of hub) {
      const b = bbox(s.outline);
      expect([b.x1 - b.x0, b.y1 - b.y0].every((d) => d >= 7 && d <= 10)).toBe(true);
    }
    expect(shapePool(["n+3"], 444, defaultConfig)).toEqual(shapePool(["n+3"], 444, defaultConfig));
  });

  it("stops when the size range has fewer rectangles than asked", () => {
    const pool = shapePool(["n"], 1, { ...defaultConfig, shapesPerType: 100 });
    expect(pool.get("n")!.length).toBe(16); // 4..7 × 4..7
  });

  it("gives every wall of every shape a door line with the defaults", () => {
    for (const shapes of shapePool(types, 444, defaultConfig).values()) {
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
