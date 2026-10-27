import { describe, expect, it } from "vitest";
import { configSpace, configSpaces, doorAt, maximumIntersection, overCorridor } from "../src/engine/configSpace";
import { defaultConfig } from "../src/engine/config";
import { doorLines } from "../src/engine/doors";
import {
  bbox,
  contains,
  overlapArea,
  polygon,
  rectangle,
  segment,
  translate,
  type Point,
  type Polygon,
  type Segment,
} from "../src/engine/geometry";
import { rng, shuffle } from "../src/engine/rng";
import { corridorShapes, shapePool, type Shape } from "../src/engine/shapes";

const p = (x: number, y: number): Point => ({ x, y });
const seg = (x0: number, y0: number, x1: number, y1: number) => segment(p(x0, y0), p(x1, y1));
const cfg = { doorLength: 1, cornerDistance: 1 };

const L = polygon([p(0, 0), p(3, 0), p(3, 4), p(7, 4), p(7, 7), p(0, 7)]);
// 9 wide, 6 tall, 3×3 notch from the top
const U = polygon([p(0, 0), p(3, 0), p(3, 3), p(6, 3), p(6, 0), p(9, 0), p(9, 6), p(0, 6)]);

const points = (segs: Segment[]) => {
  const out = new Set<string>();
  for (const s of segs)
    for (let x = s.from.x; x <= s.to.x; x++) for (let y = s.from.y; y <= s.to.y; y++) out.add(`${x},${y}`);
  return [...out].sort();
};

// Every door a shape can have, as grid segments with their outward normal.
const doors = (poly: Polygon, c: typeof cfg) =>
  doorLines(poly, c).flatMap((d) => {
    const axis = d.normal.x === 0 ? "x" : "y";
    const out = [];
    for (let v = d.line.from[axis]; v <= d.line.to[axis]; v++) {
      const from = { ...d.line.from, [axis]: v };
      out.push({ door: segment(from, { ...from, [axis]: v + d.length }), normal: d.normal });
    }
    return out;
  });

// Brute force: every offset of moving where it does not overlap fixed and shares a door with it.
const bruteForce = (moving: Polygon, fixed: Polygon, c: typeof cfg) => {
  const [bm, bf] = [bbox(moving), bbox(fixed)];
  const fixedDoors = doors(fixed, c);
  const out: string[] = [];
  for (let x = bf.x0 - bm.x1 - 1; x <= bf.x1 - bm.x0 + 1; x++) {
    for (let y = bf.y0 - bm.y1 - 1; y <= bf.y1 - bm.y0 + 1; y++) {
      const moved = translate(moving, p(x, y));
      if (overlapArea(moved, fixed) > 0) continue;
      const shared = doors(moved, c).some((m) =>
        fixedDoors.some(
          (f) =>
            f.normal.x === -m.normal.x &&
            f.normal.y === -m.normal.y &&
            f.door.from.x === m.door.from.x &&
            f.door.from.y === m.door.from.y &&
            f.door.to.x === m.door.to.x &&
            f.door.to.y === m.door.to.y,
        ),
      );
      if (shared) out.push(`${x},${y}`);
    }
  }
  return out.sort();
};

describe("configSpace", () => {
  it("puts two 3×3 squares side by side, door in the middle of the wall", () => {
    expect(configSpace(rectangle(3, 3), rectangle(3, 3), cfg).offsets).toEqual([
      seg(-3, 0, -3, 0),
      seg(0, -3, 0, -3),
      seg(0, 3, 0, 3),
      seg(3, 0, 3, 0),
    ]);
  });

  it("slides a small square along a long wall", () => {
    const space = configSpace(rectangle(3, 3), rectangle(5, 3), cfg);
    expect(space.offsets).toEqual([seg(-3, 0, -3, 0), seg(0, -3, 2, -3), seg(0, 3, 2, 3), seg(5, 0, 5, 0)]);
  });

  it("matches brute force for rectangles, L and U shapes", () => {
    const shapes = [rectangle(3, 3), rectangle(4, 6), rectangle(7, 3), L, U];
    for (const c of [cfg, { doorLength: 2, cornerDistance: 1 }, { doorLength: 1, cornerDistance: 0 }]) {
      for (const a of shapes) {
        for (const b of shapes) expect(points(configSpace(b, a, c).offsets)).toEqual(bruteForce(b, a, c));
      }
    }
  });

  it("matches brute force for the pool's L, T and plus shapes, rotated", () => {
    const pool = shapePool([{ type: "n", extra: 0 }], 444, defaultConfig).get("0/n")!.filter((s) => !s.id.startsWith("rect-"));
    const shapes = [rectangle(3, 4), ...pool.filter((s) => s.id.endsWith("-r0") || s.id.endsWith("-r1")).map((s) => s.outline)];
    expect(shapes.length).toBeGreaterThan(4);
    for (const a of shapes) {
      for (const b of shapes) expect(points(configSpace(b, a, defaultConfig).offsets)).toEqual(bruteForce(b, a, defaultConfig));
    }
  });

  it("drops door matches that overlap the fixed shape", () => {
    // A 4-wide square cannot reach the bottom of the 3-wide notch without hitting the arms.
    const offsets = configSpace(rectangle(4, 4), U, cfg).offsets;
    expect(contains(offsets, p(3, -1))).toBe(false);
    expect(contains(offsets, p(0, -4))).toBe(true); // on top of the left arm
  });

  it("has no overlap and a shared door at every offset", () => {
    const space = configSpace(rectangle(4, 5), L, cfg);
    for (const key of points(space.offsets)) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      expect(overlapArea(translate(rectangle(4, 5), p(x, y)), L)).toBe(0);
    }
  });
});

describe("configSpaces", () => {
  const a = { id: "rect-3x3", outline: rectangle(3, 3) };
  const b = { id: "rect-5x3", outline: rectangle(5, 3) };

  it("caches per ordered pair of shape ids", () => {
    const spaces = configSpaces(defaultConfig);
    expect(spaces(a, b)).toBe(spaces(a, b));
    expect(spaces(a, b)).toBe(spaces({ ...a }, { ...b }));
    expect(spaces(a, b)).not.toBe(spaces(b, a));
    expect(spaces(a, b)).toEqual(configSpace(a.outline, b.outline, defaultConfig));
  });
});

describe("over a corridor", () => {
  const c0 = { doorLength: 1, cornerDistance: 0 };
  const room = (w: number, h: number): Shape => ({ id: `rect-${w}x${h}`, outline: rectangle(w, h) });
  const corridors = (lengths: number[]) => corridorShapes({ ...defaultConfig, corridorLengths: lengths });

  it("uses a shape's own door lines: a corridor connects only at its ends", () => {
    const [v2] = corridors([2]);
    // 3×3 above or below a 1×2 vertical corridor, its door over the corridor's
    expect(configSpaces(c0)(room(3, 3), v2!).offsets).toEqual([seg(-2, -3, 0, -3), seg(-2, 2, 0, 2)]);
  });

  it("puts two 3×3 squares a corridor length apart, doors lined up through it", () => {
    expect(overCorridor(room(3, 3), room(3, 3), corridors([1]), c0).offsets).toEqual([
      seg(-4, -2, -4, 2),
      seg(-2, -4, 2, -4),
      seg(-2, 4, 2, 4),
      seg(4, -2, 4, 2),
    ]);
    expect(points(overCorridor(room(3, 3), room(3, 3), corridors([1, 2]), c0).offsets)).toEqual(
      points([...overCorridor(room(3, 3), room(3, 3), corridors([1]), c0).offsets, seg(-5, -2, -5, 2), seg(-2, -5, 2, -5), seg(-2, 5, 2, 5), seg(5, -2, 5, 2)]),
    );
  });

  // Brute force: every offset of moving that does not overlap fixed, with a corridor shape and
  // position that overlaps neither and shares a door with both.
  const ends = (s: Shape, at: Point) =>
    s.doorLines!.map((d) => {
      const from = p(d.line.from.x + at.x, d.line.from.y + at.y);
      const axis = d.normal.x === 0 ? "x" : "y"; // along the wall
      return { door: segment(from, { ...from, [axis]: from[axis] + d.length }), normal: d.normal };
    });
  const same = (a: { door: Segment; normal: Point }, b: { door: Segment; normal: Point }) =>
    a.normal.x === -b.normal.x && a.normal.y === -b.normal.y && JSON.stringify(a.door) === JSON.stringify(b.door);
  const bruteForceOver = (moving: Polygon, fixed: Polygon, cs: Shape[]) => {
    const [bm, bf] = [bbox(moving), bbox(fixed)];
    const fixedDoors = doors(fixed, c0);
    // corridor placements that share a door with fixed and do not overlap it
    const placements = cs.flatMap((c) => {
      const out = [];
      for (let cx = bf.x0 - 4; cx <= bf.x1 + 4; cx++) {
        for (let cy = bf.y0 - 4; cy <= bf.y1 + 4; cy++) {
          const at = p(cx, cy);
          const outline = translate(c.outline, at);
          const e = ends(c, at);
          if (overlapArea(outline, fixed) === 0 && e.some((d) => fixedDoors.some((f) => same(d, f)))) out.push({ outline, ends: e });
        }
      }
      return out;
    });
    const out: string[] = [];
    for (let x = bf.x0 - bm.x1 - 4; x <= bf.x1 - bm.x0 + 4; x++) {
      for (let y = bf.y0 - bm.y1 - 4; y <= bf.y1 - bm.y0 + 4; y++) {
        const moved = translate(moving, p(x, y));
        if (overlapArea(moved, fixed) > 0) continue;
        const movedDoors = doors(moved, c0);
        if (placements.some((c) => overlapArea(c.outline, moved) === 0 && c.ends.some((d) => movedDoors.some((m) => same(d, m))))) out.push(`${x},${y}`);
      }
    }
    return out.sort();
  };

  it("matches brute force for rectangles and an L", () => {
    const shapes = [rectangle(3, 3), rectangle(4, 2), L];
    const cs = corridors([1, 2]);
    for (const a of shapes) {
      for (const b of shapes) {
        const [ma, mb] = [{ id: "a", outline: a }, { id: "b", outline: b }];
        expect(points(overCorridor(mb, ma, cs, c0).offsets)).toEqual(bruteForceOver(b, a, cs));
      }
    }
  });

  it("is cached per ordered pair and link, apart from the direct space", () => {
    const spaces = configSpaces(c0, corridors([1]));
    const [a, b] = [room(3, 3), room(5, 3)];
    expect(spaces(a, b, "corridor")).toBe(spaces(a, b, "corridor"));
    expect(spaces(a, b, "corridor")).toEqual(overCorridor(a, b, corridors([1]), c0));
    expect(spaces(a, b, "corridor")).not.toEqual(spaces(a, b, "door"));
    expect(spaces(a, b)).toBe(spaces(a, b, "door"));
  });
});

describe("doorAt", () => {
  it("returns the door on the fixed shape, centred where the wall allows several", () => {
    const space = configSpace(rectangle(3, 3), rectangle(5, 3), cfg);
    expect(doorAt(space, p(0, -3))).toEqual(seg(1, 0, 2, 0));
    expect(doorAt(space, p(2, 3))).toEqual(seg(3, 3, 4, 3));
    expect(doorAt(space, p(5, 0))).toEqual(seg(5, 1, 5, 2));
    // the 9-wide top of a 9×3 against the 9-wide bottom of another: 7 door positions, the middle one
    expect(doorAt(configSpace(rectangle(9, 3), rectangle(9, 3), cfg), p(0, -3))).toEqual(seg(4, 0, 5, 0));
  });

  it("is null at an offset outside the space", () => {
    expect(doorAt(configSpace(rectangle(3, 3), rectangle(3, 3), cfg), p(1, 3))).toBeNull();
  });

  it("gives a door both shapes share", () => {
    const space = configSpace(rectangle(4, 5), L, cfg);
    for (const key of points(space.offsets)) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      const door = doorAt(space, p(x, y))!;
      const moved = doors(translate(rectangle(4, 5), p(x, y)), cfg).map((d) => d.door);
      expect(doors(L, cfg).map((d) => d.door)).toContainEqual(door);
      expect(moved).toContainEqual(door);
    }
  });
});

describe("maximumIntersection", () => {
  const sq = configSpace(rectangle(3, 3), rectangle(3, 3), cfg);

  it("intersects all neighbours when it can", () => {
    // squares at (0, 0) and (6, 0): the moving square fits between them
    const { offsets, satisfied } = maximumIntersection(
      [
        { space: sq, at: p(0, 0) },
        { space: sq, at: p(6, 0) },
      ],
      rng(1),
    );
    expect(satisfied).toBe(2);
    expect(offsets).toEqual([seg(3, 0, 3, 0)]);
  });

  it("falls back to the largest subset with a common position", () => {
    const neighbours = [
      { space: sq, at: p(0, 0) },
      { space: sq, at: p(6, 0) },
      { space: sq, at: p(40, 40) },
    ];
    const { offsets, satisfied } = maximumIntersection(neighbours, rng(1));
    expect(satisfied).toBe(2);
    expect(offsets).toEqual([seg(3, 0, 3, 0)]);
  });

  it("picks one neighbour at random when none share a position", () => {
    const neighbours = [
      { space: sq, at: p(0, 0) },
      { space: sq, at: p(40, 40) },
    ];
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const { offsets, satisfied } = maximumIntersection(neighbours, rng(seed));
      expect(satisfied).toBe(1);
      seen.add(JSON.stringify(offsets));
    }
    expect(seen.size).toBe(2);
    const again = (seed: number) => maximumIntersection(neighbours, rng(seed));
    expect(again(3)).toEqual(again(3));
  });

  it("satisfies none without neighbours", () => {
    expect(maximumIntersection([], rng(1))).toEqual({ offsets: [], satisfied: 0 });
  });
});

describe("contains", () => {
  it("looks a point up in a set of segments", () => {
    const segs = [seg(0, 0, 3, 0), seg(5, 1, 5, 4)];
    expect(contains(segs, p(2, 0))).toBe(true);
    expect(contains(segs, p(5, 4))).toBe(true);
    expect(contains(segs, p(4, 0))).toBe(false);
    expect(contains(segs, p(5, 0))).toBe(false);
  });
});

describe("shuffle", () => {
  it("permutes in place, deterministic per seed", () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], rng(9));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shuffle([1, 2, 3, 4, 5, 6], rng(9))).toEqual(a);
  });
});
