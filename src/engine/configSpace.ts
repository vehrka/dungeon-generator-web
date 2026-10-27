import type { LayoutConfig } from "./config";
import { doorLines, type DoorLine } from "./doors";
import { contains, intersect, intersectAll, merge, overlapArea, segment, translate, type Point, type Polygon, type Segment } from "./geometry";
import { shuffle, type Rng } from "./rng";
import type { Shape } from "./shapes";

// Offsets of a moving shape relative to a fixed one. `doors` keeps the door line pair behind each
// raw offset segment (before overlap removal), to find the door at a chosen offset.
export type ConfigSpace = {
  offsets: Segment[];
  doors: { offsets: Segment; fixed: DoorLine; moving: DoorLine }[];
};

type DoorConfig = Pick<LayoutConfig, "doorLength" | "cornerDistance">;

// Edgar's ConfigurationSpacesGenerator.cs: offsets where a door of the moving shape lies on a door
// of the fixed one, facing it, minus the offsets where the shapes overlap. Door lines default to
// every wall (doors.ts); corridors bring their own.
export function configSpace(
  moving: Polygon,
  fixed: Polygon,
  config: DoorConfig,
  lines: { moving?: DoorLine[]; fixed?: DoorLine[] } = {},
): ConfigSpace {
  const fixedLines = lines.fixed ?? doorLines(fixed, config);
  const doors: ConfigSpace["doors"] = [];
  for (const m of lines.moving ?? doorLines(moving, config)) {
    for (const f of fixedLines) {
      if (f.length !== m.length || f.normal.x !== -m.normal.x || f.normal.y !== -m.normal.y) continue;
      // door starts coincide: q_f = q_m + offset, so offset ranges over f.line − m.line
      const from = { x: f.line.from.x - m.line.to.x, y: f.line.from.y - m.line.to.y };
      const to = { x: f.line.to.x - m.line.from.x, y: f.line.to.y - m.line.from.y };
      doors.push({ offsets: segment(from, to), fixed: f, moving: m });
    }
  }
  const offsets = merge(doors.flatMap((d) => withoutOverlap(moving, fixed, d.offsets)));
  return { offsets, doors };
}

// Runs of the segment's grid points where the shapes do not overlap. Shapes are small, so point by
// point is cheap enough.
function withoutOverlap(moving: Polygon, fixed: Polygon, s: Segment): Segment[] {
  const axis = s.from.y === s.to.y ? "x" : "y";
  const runs: Segment[] = [];
  let start: Point | null = null;
  let last: Point | null = null;
  for (let v = s.from[axis]; v <= s.to[axis]; v++) {
    const q = { ...s.from, [axis]: v };
    if (overlapArea(translate(moving, q), fixed) === 0) {
      start ??= q;
      last = q;
    } else if (start) {
      runs.push(segment(start, last!));
      start = null;
    }
  }
  if (start) runs.push(segment(start, last!));
  return runs;
}

// Thesis Algorithm 1 (GetConfigurationSpaceOverCorridor): for every offset of a corridor against
// the fixed shape, the moving shape's offsets against that corridor; merged over the corridor
// shapes, minus where moving overlaps fixed. No doors: stage two places the corridor itself.
export function overCorridor(
  moving: Shape,
  fixed: Shape,
  corridors: Shape[],
  config: DoorConfig,
  direct: (moving: Shape, fixed: Shape) => ConfigSpace = (m, f) => shapeSpace(m, f, config),
): ConfigSpace {
  const raw: Segment[] = [];
  for (const c of corridors) {
    const beyond = direct(moving, c).offsets;
    for (const s of direct(c, fixed).offsets) {
      const axis = s.from.y === s.to.y ? "x" : "y";
      for (const t of beyond) {
        // the sum of two parallel segments (or a point) is one segment; perpendicular ones, point by point
        if (s.from[axis] === s.to[axis] || t.from[axis === "x" ? "y" : "x"] === t.to[axis === "x" ? "y" : "x"]) {
          raw.push(segment(translatePoint(s.from, t.from), translatePoint(s.to, t.to)));
          continue;
        }
        for (let v = s.from[axis]; v <= s.to[axis]; v++) {
          const q = { ...s.from, [axis]: v };
          raw.push(segment(translatePoint(t.from, q), translatePoint(t.to, q)));
        }
      }
    }
  }
  return { offsets: merge(merge(raw).flatMap((s) => withoutOverlap(moving.outline, fixed.outline, s))), doors: [] };
}

const shapeSpace = (moving: Shape, fixed: Shape, config: DoorConfig) =>
  configSpace(moving.outline, fixed.outline, config, { moving: moving.doorLines, fixed: fixed.doorLines });

// How two placed shapes connect: a door in a shared wall, or a corridor between them.
export type Link = "door" | "corridor";

// Cached per (moving, fixed) shape id and link; shapes with the same outline and doors share an id.
export function configSpaces(config: DoorConfig, corridors: Shape[] = []): (moving: Shape, fixed: Shape, link?: Link) => ConfigSpace {
  const cache = new Map<string, ConfigSpace>();
  const space = (moving: Shape, fixed: Shape, link: Link = "door"): ConfigSpace => {
    const key = `${moving.id}|${fixed.id}|${link}`;
    let s = cache.get(key);
    if (!s) {
      s = link === "door" ? shapeSpace(moving, fixed, config) : overCorridor(moving, fixed, corridors, config, space);
      cache.set(key, s);
    }
    return s;
  };
  return space;
}

// The door at a valid offset, in the fixed shape's coordinates. Where the wall allows several door
// positions, the middle one.
export function doorAt(space: ConfigSpace, offset: Point): Segment | null {
  if (!contains(space.offsets, offset)) return null;
  for (const d of space.doors) {
    if (!contains([d.offsets], offset)) continue;
    const moved = { from: translatePoint(d.moving.line.from, offset), to: translatePoint(d.moving.line.to, offset) };
    const starts = intersect(d.fixed.line, moved);
    if (!starts) continue;
    const axis = d.fixed.normal.x === 0 ? "x" : "y"; // along the wall
    const from = { ...starts.from, [axis]: Math.floor((starts.from[axis] + starts.to[axis]) / 2) };
    return segment(from, { ...from, [axis]: from[axis] + d.fixed.length });
  }
  return null;
}

const translatePoint = (q: Point, by: Point): Point => ({ x: q.x + by.x, y: q.y + by.y });

// A placed neighbour: its configuration space (moving shape relative to the neighbour's shape) and
// where the neighbour sits.
export type Neighbour = { space: ConfigSpace; at: Point };

// Edgar's AbstractConfigurationSpaces.GetMaximumIntersection: all neighbours, then every subset one
// smaller, and so on, until the intersection is not empty. Shuffled first, so ties between subsets
// of the same size go to a random one. Absolute positions.
export function maximumIntersection(neighbours: Neighbour[], r: Rng): { offsets: Segment[]; satisfied: number } {
  const spaces = shuffle(
    neighbours.map((n) => n.space.offsets.map((s) => segment(translatePoint(s.from, n.at), translatePoint(s.to, n.at)))),
    r,
  );
  for (let k = spaces.length; k > 0; k--) {
    for (const subset of combinations(spaces.length, k)) {
      let offsets = spaces[subset[0]!]!;
      for (const i of subset.slice(1)) {
        offsets = intersectAll(offsets, spaces[i]!);
        if (offsets.length === 0) break;
      }
      if (offsets.length > 0) return { offsets: merge(offsets), satisfied: k };
    }
  }
  return { offsets: [], satisfied: 0 };
}

// k-subsets of 0..n−1, lexicographic.
function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield [...idx];
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]!++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
}
