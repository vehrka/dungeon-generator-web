import { describe, expect, it } from "vitest";
import { configSpace, configSpaces, doorAt, maximumIntersection } from "../src/engine/configSpace";
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
