import type { ConfigSpace, Link } from "./configSpace";
import { bbox, contains, partition, type Point, type Polygon, type Rect } from "./geometry";
import type { Shape } from "./shapes";
import type { RoomId } from "./types";

export type Configuration = { shape: Shape; at: Point };

// Overlap area, distance and touching rooms of one room against all the other placed rooms.
export type Terms = { overlap: number; distance: number; touching: number };

// A (partial) layout. Each room carries its terms so a move only recomputes the pairs it touches.
export type LayoutState = Map<RoomId, Configuration & Terms>;

// Corridors placed in stage two sit in the state as rooms of their own ids, `corridor` tells them.
export type EnergyContext = {
  link: (a: RoomId, b: RoomId) => Link | undefined;
  space: (moving: Shape, fixed: Shape, link?: Link) => ConfigSpace;
  sigma: number; // 10 · average shape size
  corridor: (id: RoomId) => boolean;
  roomsCanTouch: boolean;
};

// Edgar's BasicConstraint.ComputeEnergy plus TouchingConstraints (the count as is). Edgar's
// CorridorConstraints adds a second exp term for the corridor distance; one shared term here, zero
// on the same layouts.
export const roomEnergy = ({ overlap, distance, touching }: Terms, sigma: number): number =>
  Math.exp(overlap / (sigma * 625)) * Math.exp(distance / (sigma * 50)) - 1 + touching;

export const energy = (state: LayoutState, sigma: number): number =>
  [...state.values()].reduce((e, c) => e + roomEnergy(c, sigma), 0);

export const isValid = (state: LayoutState): boolean =>
  [...state.values()].every((c) => c.overlap === 0 && c.distance === 0 && c.touching === 0);

// Bounding box and rectangle partition per outline, computed once: the hot path of the layout.
const cache = new WeakMap<Polygon, { box: Rect; rects: Rect[] }>();
function cached(outline: Polygon) {
  let c = cache.get(outline);
  if (!c) {
    c = { box: bbox(outline), rects: partition(outline) };
    cache.set(outline, c);
  }
  return c;
}

export function centre({ shape, at }: Configuration): Point {
  const b = cached(shape.outline).box;
  return { x: at.x + (b.x0 + b.x1) / 2, y: at.y + (b.y0 + b.y1) / 2 };
}

// geometry.overlapArea on the cached partitions, without building translated polygons.
function overlap(a: Configuration, b: Configuration): number {
  const [ca, cb] = [cached(a.shape.outline), cached(b.shape.outline)];
  const dx = b.at.x - a.at.x;
  const dy = b.at.y - a.at.y;
  const [ba, bb] = [ca.box, cb.box];
  if (ba.x1 <= bb.x0 + dx || bb.x1 + dx <= ba.x0 || ba.y1 <= bb.y0 + dy || bb.y1 + dy <= ba.y0) return 0;
  let total = 0;
  for (const r of ca.rects) {
    for (const s of cb.rects) {
      const w = Math.min(r.x1, s.x1 + dx) - Math.max(r.x0, s.x0 + dx);
      const h = Math.min(r.y1, s.y1 + dy) - Math.max(r.y0, s.y0 + dy);
      if (w > 0 && h > 0) total += w * h;
    }
  }
  return total;
}

// Shapes that do not overlap share a wall or a corner (PolygonOverlapBase.DoTouch, length 0).
function touch(a: Configuration, b: Configuration): boolean {
  const [ca, cb] = [cached(a.shape.outline), cached(b.shape.outline)];
  const dx = b.at.x - a.at.x;
  const dy = b.at.y - a.at.y;
  const [ba, bb] = [ca.box, cb.box];
  if (ba.x1 < bb.x0 + dx || bb.x1 + dx < ba.x0 || ba.y1 < bb.y0 + dy || bb.y1 + dy < ba.y0) return false;
  for (const r of ca.rects) {
    for (const s of cb.rects) {
      const w = Math.min(r.x1, s.x1 + dx) - Math.max(r.x0, s.x0 + dx);
      const h = Math.min(r.y1, s.y1 + dy) - Math.max(r.y0, s.y0 + dy);
      if ((w === 0 && h >= 0) || (h === 0 && w >= 0)) return true;
    }
  }
  return false;
}

// Overlapping rooms count their overlap. Linked rooms that do not overlap and are not at a valid
// configuration space offset for their link count the Manhattan distance of their centres (at
// least 1: two shapes can share a centre without overlapping). With roomsCanTouch false, rooms
// without a direct door that touch count 1 (TouchingConstraints.cs); corridors may touch anything.
export function pairTerms(ctx: EnergyContext, i: RoomId, a: Configuration, j: RoomId, b: Configuration): Terms {
  const area = overlap(a, b);
  if (area > 0) return { overlap: area, distance: 0, touching: 0 };
  const link = ctx.link(i, j);
  const touching = !ctx.roomsCanTouch && link !== "door" && !ctx.corridor(i) && !ctx.corridor(j) && touch(a, b) ? 1 : 0;
  if (!link || contains(ctx.space(a.shape, b.shape, link).offsets, { x: a.at.x - b.at.x, y: a.at.y - b.at.y })) {
    return { overlap: 0, distance: 0, touching };
  }
  const [ca, cb] = [centre(a), centre(b)];
  return { overlap: 0, distance: Math.max(1, Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y)), touching };
}

// Terms of a room at a configuration against every other placed room.
export function terms(ctx: EnergyContext, state: LayoutState, room: RoomId, c: Configuration): Terms {
  const t = { overlap: 0, distance: 0, touching: 0 };
  for (const [j, b] of state) {
    if (j === room) continue;
    const p = pairTerms(ctx, room, c, j, b);
    t.overlap += p.overlap;
    t.distance += p.distance;
    t.touching += p.touching;
  }
  return t;
}

// A new state with the room placed (or moved, or reshaped), and the terms of the rooms it
// interacts with updated by the difference.
export function place(ctx: EnergyContext, state: LayoutState, room: RoomId, shape: Shape, at: Point): LayoutState {
  const old = state.get(room);
  const c = { shape, at };
  const next = new Map(state);
  const t = { overlap: 0, distance: 0, touching: 0 };
  for (const [j, b] of state) {
    if (j === room) continue;
    const now = pairTerms(ctx, room, c, j, b);
    const before = old ? pairTerms(ctx, room, old, j, b) : { overlap: 0, distance: 0, touching: 0 };
    t.overlap += now.overlap;
    t.distance += now.distance;
    t.touching += now.touching;
    if (now.overlap !== before.overlap || now.distance !== before.distance || now.touching !== before.touching) {
      next.set(j, {
        ...b,
        overlap: b.overlap + now.overlap - before.overlap,
        distance: b.distance + now.distance - before.distance,
        touching: b.touching + now.touching - before.touching,
      });
    }
  }
  next.set(room, { ...c, ...t });
  return next;
}
