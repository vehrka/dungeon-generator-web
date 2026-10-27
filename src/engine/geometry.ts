// Integer grid geometry, screen coordinates (y grows down).

export type Point = { x: number; y: number };

// Orthogonal polygon, clockwise on screen, starting at its top-left corner. Build with polygon().
export type Polygon = readonly Point[];

// Axis-parallel segment (or a single point), from ≤ to. Build with segment().
export type Segment = { from: Point; to: Point };

// Polygon edge plus its outward unit normal.
export type Wall = Segment & { normal: Point };

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export function polygon(points: Point[]): Polygon {
  const n = points.length;
  if (n < 4) throw new Error("A polygon needs at least 4 points");
  const at = (i: number) => points[(i + n) % n]!;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = [at(i), at(i + 1), at(i + 2)];
    if ((a.x === b.x) === (a.y === b.y)) throw new Error(`Edge ${i} is not parallel to an axis`);
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) {
      throw new Error(`Edges ${i} and ${(i + 1) % n} are collinear`);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      if (intersect(segment(at(i), at(i + 1)), segment(at(j), at(j + 1)))) {
        throw new Error(`Edges ${i} and ${j} intersect`);
      }
    }
  }

  const ordered = signedArea2(points) < 0 ? [...points].reverse() : [...points];
  let first = 0;
  ordered.forEach((q, i) => {
    const f = ordered[first]!;
    if (q.y < f.y || (q.y === f.y && q.x < f.x)) first = i;
  });
  return [...ordered.slice(first), ...ordered.slice(0, first)];
}

export const rectangle = (width: number, height: number): Polygon =>
  polygon([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]);

export const translate = (poly: Polygon, by: Point): Polygon => poly.map((q) => ({ x: q.x + by.x, y: q.y + by.y }));

// Quarter turns clockwise on screen ((x, y) → (−y, x)), moved back so the bounding box starts at 0,0.
export function rotate(poly: Polygon, quarterTurns: number): Polygon {
  let points = poly.map((q) => ({ ...q }));
  for (let i = 0; i < (((quarterTurns % 4) + 4) % 4); i++) points = points.map((q) => ({ x: -q.y, y: q.x }));
  const b = bbox(points);
  return polygon(points.map((q) => ({ x: q.x - b.x0 + 0, y: q.y - b.y0 + 0 }))); // + 0: no −0
}

export const area = (poly: Polygon): number => signedArea2(poly) / 2;

export function bbox(poly: Polygon): Rect {
  const xs = poly.map((q) => q.x);
  const ys = poly.map((q) => q.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// Twice the shoelace area: positive when clockwise on screen.
function signedArea2(points: readonly Point[]): number {
  return points.reduce((s, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return s + a.x * b.y - b.x * a.y;
  }, 0);
}

export function walls(poly: Polygon): Wall[] {
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    return { ...segment(a, b), normal: { x: dy, y: -dx || 0 } }; // clockwise: outside is on the left
  });
}

// Vertical slabs between consecutive x coordinates; in each slab the horizontal edges pair up
// into the top and bottom of rectangles. "rows": horizontal slabs, through the transposed polygon.
export function partition(poly: Polygon, slabs: "columns" | "rows" = "columns"): Rect[] {
  if (slabs === "rows") {
    return partition(polygon(poly.map((q) => ({ x: q.y, y: q.x })))).map((r) => ({ x0: r.y0, y0: r.x0, x1: r.y1, y1: r.x1 }));
  }
  const xs = [...new Set(poly.map((q) => q.x))].sort((a, b) => a - b);
  const horizontal = walls(poly).filter((w) => w.from.y === w.to.y);
  const rects: Rect[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const [x0, x1] = [xs[i]!, xs[i + 1]!];
    const ys = horizontal
      .filter((w) => w.from.x <= x0 && w.to.x >= x1)
      .map((w) => w.from.y)
      .sort((a, b) => a - b);
    for (let j = 0; j + 1 < ys.length; j += 2) rects.push({ x0, y0: ys[j]!, x1, y1: ys[j + 1]! });
  }
  return rects;
}

export function overlapArea(a: Polygon, b: Polygon): number {
  const rb = partition(b);
  let total = 0;
  for (const r of partition(a)) {
    for (const s of rb) {
      const w = Math.min(r.x1, s.x1) - Math.max(r.x0, s.x0);
      const h = Math.min(r.y1, s.y1) - Math.max(r.y0, s.y0);
      if (w > 0 && h > 0) total += w * h;
    }
  }
  return total;
}

export function segment(a: Point, b: Point): Segment {
  if (a.x !== b.x && a.y !== b.y) throw new Error("A segment must be parallel to an axis");
  return a.x < b.x || a.y < b.y ? { from: { ...a }, to: { ...b } } : { from: { ...b }, to: { ...a } };
}

// Both are axis-parallel, so the intersection is the overlap of their boxes: a segment, a point or null.
export function intersect(a: Segment, b: Segment): Segment | null {
  const x0 = Math.max(a.from.x, b.from.x);
  const x1 = Math.min(a.to.x, b.to.x);
  const y0 = Math.max(a.from.y, b.from.y);
  const y1 = Math.min(a.to.y, b.to.y);
  return x0 <= x1 && y0 <= y1 ? { from: { x: x0, y: y0 }, to: { x: x1, y: y1 } } : null;
}

export function intersectAll(a: Segment[], b: Segment[]): Segment[] {
  return merge(a.flatMap((s) => b.flatMap((t) => intersect(s, t) ?? [])));
}

// Union of segments as sets of grid points: segments on one line merge when they overlap or when
// no grid point lies between them. Single points count as horizontal. Sorted by start.
export function merge(segments: Segment[]): Segment[] {
  const lines = new Map<string, Segment[]>();
  for (const s of segments) {
    const k = s.from.y === s.to.y ? `h${s.from.y}` : `v${s.from.x}`;
    lines.set(k, [...(lines.get(k) ?? []), s]);
  }

  const out: Segment[] = [];
  for (const [k, line] of lines) {
    const axis = k[0] === "h" ? "x" : "y";
    line.sort((s, t) => s.from[axis] - t.from[axis]);
    let cur = { from: { ...line[0]!.from }, to: { ...line[0]!.to } };
    for (const s of line.slice(1)) {
      if (s.from[axis] <= cur.to[axis] + 1) {
        if (s.to[axis] > cur.to[axis]) cur.to = { ...s.to };
      } else {
        out.push(cur);
        cur = { from: { ...s.from }, to: { ...s.to } };
      }
    }
    out.push(cur);
  }
  return out.sort((s, t) => s.from.x - t.from.x || s.from.y - t.from.y || s.to.x - t.to.x || s.to.y - t.to.y);
}

export const contains = (segments: Segment[], q: Point): boolean =>
  segments.some((s) => s.from.x <= q.x && q.x <= s.to.x && s.from.y <= q.y && q.y <= s.to.y);
