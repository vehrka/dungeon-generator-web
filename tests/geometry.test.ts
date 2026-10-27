import { describe, expect, it } from "vitest";
import {
  area,
  bbox,
  intersect,
  intersectAll,
  merge,
  overlapArea,
  partition,
  polygon,
  rectangle,
  rotate,
  segment,
  translate,
  walls,
  type Point,
  type Polygon,
  type Segment,
} from "../src/engine/geometry";

const p = (x: number, y: number): Point => ({ x, y });
const poly = (...xy: number[]) => polygon(Array.from({ length: xy.length / 2 }, (_, i) => p(xy[2 * i]!, xy[2 * i + 1]!)));
const seg = (x0: number, y0: number, x1: number, y1: number) => segment(p(x0, y0), p(x1, y1));

// L: 3×3 square without its top-right 2×2 corner, clockwise on screen (y down)
const L = poly(0, 0, 1, 0, 1, 2, 3, 2, 3, 3, 0, 3);
// U: 3 wide, 3 tall, 1×2 notch from the top
const U = poly(0, 0, 1, 0, 1, 2, 2, 2, 2, 0, 3, 0, 3, 3, 0, 3);
const T = poly(0, 0, 3, 0, 3, 1, 2, 1, 2, 3, 1, 3, 1, 1, 0, 1);
const plus = poly(1, 0, 2, 0, 2, 1, 3, 1, 3, 2, 2, 2, 2, 3, 1, 3, 1, 2, 0, 2, 0, 1, 1, 1);

// Independent point-in-polygon (ray casting), for cell-counting checks.
const inside = (poly: Polygon, x: number, y: number) => {
  let c = false;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    if (a.x === b.x && (a.y > y) !== (b.y > y) && x < a.x) c = !c;
  });
  return c;
};

const cellArea = (a: Polygon, b: Polygon) => {
  const box = bbox(a);
  let n = 0;
  for (let x = box.x0; x < box.x1; x++)
    for (let y = box.y0; y < box.y1; y++) if (inside(a, x + 0.5, y + 0.5) && inside(b, x + 0.5, y + 0.5)) n++;
  return n;
};

// Lattice points of segments, for set comparisons.
const points = (segs: Segment[]) => {
  const out = new Set<string>();
  for (const s of segs)
    for (let x = s.from.x; x <= s.to.x; x++) for (let y = s.from.y; y <= s.to.y; y++) out.add(`${x},${y}`);
  return [...out].sort();
};

describe("polygon", () => {
  it("rejects bad outlines", () => {
    expect(() => poly(0, 0, 1, 0, 1, 1)).toThrow(/4 points/);
    expect(() => poly(0, 0, 2, 0, 2, 2, 1, 3)).toThrow(/axis/);
    expect(() => poly(0, 0, 0, 0, 1, 0, 1, 1, 0, 1)).toThrow(/axis/);
    expect(() => poly(0, 0, 1, 0, 2, 0, 2, 1, 0, 1)).toThrow(/collinear/);
    // figure eight: two squares crossing at a corner
    expect(() => poly(0, 0, 2, 0, 2, 2, 4, 2, 4, 4, 2, 4, 2, 2, 0, 2)).toThrow(/intersect/);
  });

  it("stores outlines clockwise on screen", () => {
    const ccw = poly(0, 0, 0, 2, 3, 2, 3, 0);
    expect(area(ccw)).toBe(6);
    expect(ccw).toEqual(rectangle(3, 2));
  });

  it("measures area, box and translation", () => {
    expect(area(rectangle(4, 3))).toBe(12);
    expect(area(L)).toBe(5);
    expect(area(U)).toBe(7);
    expect(area(plus)).toBe(5);
    expect(bbox(translate(L, p(5, -1)))).toEqual({ x0: 5, y0: -1, x1: 8, y1: 2 });
  });
});

describe("walls", () => {
  it("gives a rectangle four walls with outward normals", () => {
    expect(walls(rectangle(4, 2))).toEqual([
      { from: p(0, 0), to: p(4, 0), normal: p(0, -1) },
      { from: p(4, 0), to: p(4, 2), normal: p(1, 0) },
      { from: p(0, 2), to: p(4, 2), normal: p(0, 1) },
      { from: p(0, 0), to: p(0, 2), normal: p(-1, 0) },
    ]);
  });

  it("points every normal out of the polygon", () => {
    for (const shape of [L, U, T, plus]) {
      const ws = walls(shape);
      expect(ws).toHaveLength(shape.length);
      for (const w of ws) {
        const mx = (w.from.x + w.to.x) / 2;
        const my = (w.from.y + w.to.y) / 2;
        expect(inside(shape, mx + w.normal.x * 0.5, my + w.normal.y * 0.5)).toBe(false);
        expect(inside(shape, mx - w.normal.x * 0.5, my - w.normal.y * 0.5)).toBe(true);
      }
    }
  });
});

describe("partition", () => {
  it("cuts columns or rows", () => {
    expect(partition(L)).toEqual([
      { x0: 0, y0: 0, x1: 1, y1: 3 },
      { x0: 1, y0: 2, x1: 3, y1: 3 },
    ]);
    expect(partition(L, "rows")).toEqual([
      { x0: 0, y0: 0, x1: 1, y1: 2 },
      { x0: 0, y0: 2, x1: 3, y1: 3 },
    ]);
  });

  it.each(["columns", "rows"] as const)("splits shapes into disjoint rectangles covering the area (%s)", (slabs) => {
    for (const shape of [rectangle(3, 5), L, U, T, plus]) {
      const rs = partition(shape, slabs);
      expect(rs.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0)).toBe(area(shape));
      rs.forEach((a, i) =>
        rs.slice(i + 1).forEach((b) => {
          const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
          const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
          expect(w > 0 && h > 0).toBe(false);
        }),
      );
    }
  });
});

describe("rotate", () => {
  it("turns clockwise on screen and moves the result back to the origin", () => {
    expect(rotate(rectangle(3, 5), 1)).toEqual(rectangle(5, 3));
    // L's foot (bottom, 3 wide) turns to the left side, its arm to the top
    expect(rotate(L, 1)).toEqual(poly(0, 0, 3, 0, 3, 1, 1, 1, 1, 3, 0, 3));
    expect(rotate(L, -1)).toEqual(rotate(L, 3));
  });

  it("keeps area and validity, four quarter turns give the shape back", () => {
    for (const shape of [rectangle(3, 5), L, U, T, plus]) {
      for (let q = 0; q < 4; q++) {
        const r = rotate(shape, q);
        expect(area(r)).toBe(area(shape));
        expect(polygon([...r])).toEqual(r);
        expect([bbox(r).x0, bbox(r).y0]).toEqual([0, 0]);
      }
      expect(rotate(rotate(shape, 2), 2)).toEqual(shape);
      expect(rotate(shape, 4)).toEqual(shape);
    }
    expect(rotate(plus, 1)).toEqual(plus);
  });
});

describe("overlapArea", () => {
  it("handles simple cases", () => {
    const sq = rectangle(2, 2);
    expect(overlapArea(sq, sq)).toBe(4);
    expect(overlapArea(sq, translate(sq, p(2, 0)))).toBe(0); // touching edge
    expect(overlapArea(sq, translate(sq, p(5, 5)))).toBe(0);
    expect(overlapArea(sq, translate(sq, p(1, 1)))).toBe(1);
    expect(overlapArea(L, translate(rectangle(2, 2), p(1, 0)))).toBe(0); // fills the notch
    expect(overlapArea(U, translate(rectangle(1, 3), p(1, -1)))).toBe(0); // in the U's notch
  });

  it("matches cell counting for shapes at random offsets", () => {
    const shapes = [rectangle(3, 2), rectangle(1, 4), L, U, T, plus];
    let s = 9;
    const rand = (n: number) => ((s = (s * 1103515245 + 12345) % 2 ** 31), Math.floor((s / 2 ** 31) * n));
    for (let run = 0; run < 300; run++) {
      const a = shapes[rand(shapes.length)]!;
      const b = translate(shapes[rand(shapes.length)]!, p(rand(7) - 3, rand(7) - 3));
      expect(overlapArea(a, b)).toBe(cellArea(a, b));
      expect(overlapArea(b, a)).toBe(overlapArea(a, b));
    }
  });
});

describe("segments", () => {
  it("normalizes direction and rejects diagonals", () => {
    expect(seg(3, 1, 0, 1)).toEqual({ from: p(0, 1), to: p(3, 1) });
    expect(seg(2, 5, 2, 1)).toEqual({ from: p(2, 1), to: p(2, 5) });
    expect(() => seg(0, 0, 1, 1)).toThrow(/axis/);
  });

  it("intersects two segments", () => {
    expect(intersect(seg(0, 0, 5, 0), seg(3, 0, 8, 0))).toEqual(seg(3, 0, 5, 0)); // collinear overlap
    expect(intersect(seg(0, 0, 5, 0), seg(5, 0, 8, 0))).toEqual(seg(5, 0, 5, 0)); // end to end
    expect(intersect(seg(0, 0, 5, 0), seg(6, 0, 8, 0))).toBeNull();
    expect(intersect(seg(0, 2, 5, 2), seg(3, 0, 3, 4))).toEqual(seg(3, 2, 3, 2)); // crossing
    expect(intersect(seg(0, 2, 5, 2), seg(5, 0, 5, 2))).toEqual(seg(5, 2, 5, 2)); // corner
    expect(intersect(seg(0, 2, 5, 2), seg(6, 0, 6, 4))).toBeNull();
    expect(intersect(seg(0, 0, 5, 0), seg(0, 1, 5, 1))).toBeNull(); // parallel
    expect(intersect(seg(2, 0, 2, 0), seg(0, 0, 5, 0))).toEqual(seg(2, 0, 2, 0)); // point on line
  });

  it("merges overlapping and adjacent segments on the same line", () => {
    expect(merge([seg(0, 0, 3, 0), seg(2, 0, 6, 0)])).toEqual([seg(0, 0, 6, 0)]);
    expect(merge([seg(0, 0, 3, 0), seg(4, 0, 6, 0)])).toEqual([seg(0, 0, 6, 0)]); // no point between
    expect(merge([seg(0, 0, 3, 0), seg(5, 0, 6, 0)])).toHaveLength(2);
    expect(merge([seg(0, 0, 9, 0), seg(2, 0, 3, 0)])).toEqual([seg(0, 0, 9, 0)]);
    expect(merge([seg(0, 0, 3, 0), seg(0, 1, 3, 1)])).toHaveLength(2);
    expect(merge([seg(1, 0, 1, 4), seg(1, 3, 1, 7), seg(4, 4, 4, 4), seg(4, 4, 4, 4)])).toEqual([
      seg(1, 0, 1, 7),
      seg(4, 4, 4, 4),
    ]);
  });

  it("intersects sets of segments as point sets", () => {
    let s = 5;
    const rand = (n: number) => ((s = (s * 1103515245 + 12345) % 2 ** 31), Math.floor((s / 2 ** 31) * n));
    const randomSeg = () => {
      const [x, y, l] = [rand(8), rand(8), rand(5)];
      return rand(2) ? seg(x, y, x + l, y) : seg(x, y, x, y + l);
    };
    for (let run = 0; run < 200; run++) {
      const a = Array.from({ length: 1 + rand(4) }, randomSeg);
      const b = Array.from({ length: 1 + rand(4) }, randomSeg);
      const expected = points(a).filter((q) => points(b).includes(q));
      const got = intersectAll(a, b);
      expect(points(got)).toEqual(expected);
      expect(merge(got)).toEqual(got);
    }
  });
});
