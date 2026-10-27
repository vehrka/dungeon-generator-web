import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import m1 from "./fixtures/m-1.json";
import { normalize } from "../src/engine/normalize";
import { faces } from "../src/engine/planar";
import { chains } from "../src/engine/chains";
import { defaultConfig, type LayoutConfig } from "../src/engine/config";
import { poolKeys, shapePool } from "../src/engine/shapes";
import { layout, LayoutError, type Layout } from "../src/engine/layout";
import { bbox, overlapArea, translate, walls, type Polygon, type Segment } from "../src/engine/geometry";
import type { DungeonJson, RoomGraph } from "../src/engine/types";

type Edge = [number, number];

const graph = (edges: Edge[]): RoomGraph => {
  const ids = [...new Set(edges.flat())];
  return {
    rooms: new Map(ids.map((id) => [id, { id, type: "n", number: id + 1, label: `Room ${id}`, objects: [] }])),
    doors: edges.map(([a, b]) => ({ a, b, oneway: false })),
    start: ids[0]!,
    goal: ids[0]!,
  };
};

const run = (g: RoomGraph, seed: number, config: LayoutConfig = defaultConfig) => {
  const pool = shapePool(poolKeys(g, config).values(), seed, config);
  return layout(g, chains(g, faces(g), config.maxTreeSize), pool, seed, config);
};

// The segment lies on a wall of the polygon.
const onWall = (poly: Polygon, s: Segment) =>
  walls(poly).some(
    (w) => w.from.x <= s.from.x && s.to.x <= w.to.x && w.from.y <= s.from.y && s.to.y <= w.to.y,
  );

const direct: LayoutConfig = { ...defaultConfig, corridors: false };

// No two rooms or corridors overlap; every door is doorLength long. A direct door lies on a wall of
// both rooms; through a corridor, segment on room a and the corridor, corridor.segment on room b and
// the corridor.
const expectValid = (g: RoomGraph, l: Layout) => {
  const outline = new Map(l.placements.map((pl) => [pl.room, translate(pl.shape.outline, pl.at)]));
  expect([...outline.keys()].sort((a, b) => a - b)).toEqual([...g.rooms.keys()].sort((a, b) => a - b));
  const corridors = new Map(
    l.doors.flatMap(({ corridor: c }) => (c ? [[`${c.shape.id}@${c.at.x},${c.at.y}`, translate(c.shape.outline, c.at)] as const] : [])),
  );
  const pieces: [string, Polygon][] = [...[...outline].map(([id, o]): [string, Polygon] => [`room ${id}`, o]), ...[...corridors].map(([k, o]): [string, Polygon] => [`corridor ${k}`, o])];
  pieces.forEach(([a, pa], i) => {
    for (const [b, pb] of pieces.slice(i + 1)) expect(overlapArea(pa, pb), `${a} and ${b} overlap`).toBe(0);
  });
  expect(l.doors.map((d) => d.door)).toEqual(g.doors);
  const length = (s: Segment) => s.to.x - s.from.x + s.to.y - s.from.y;
  for (const { door, segment, corridor } of l.doors) {
    expect(length(segment)).toBe(defaultConfig.doorLength);
    expect(onWall(outline.get(door.a)!, segment), `door ${door.a}–${door.b} not on ${door.a}`).toBe(true);
    if (!corridor) {
      expect(onWall(outline.get(door.b)!, segment), `door ${door.a}–${door.b} not on ${door.b}`).toBe(true);
      continue;
    }
    const c = translate(corridor.shape.outline, corridor.at);
    expect(length(corridor.segment)).toBe(defaultConfig.doorLength);
    expect(onWall(c, segment), `door ${door.a}–${door.b} not on its corridor`).toBe(true);
    expect(onWall(c, corridor.segment), `door ${door.a}–${door.b} not on its corridor`).toBe(true);
    expect(onWall(outline.get(door.b)!, corridor.segment), `corridor ${door.a}–${door.b} not on ${door.b}`).toBe(true);
  }
};

// Rooms share a wall or a corner: their boxes meet without overlapping (rectangles only).
const touch = (a: Polygon, b: Polygon) => {
  const [p, q] = [bbox(a), bbox(b)];
  const dx = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
  const dy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
  return (dx === 0 && dy >= 0) || (dy === 0 && dx >= 0);
};

describe("layout", () => {
  it("lays out a path", () => {
    const g = graph([[0, 1], [1, 2], [2, 3], [3, 4]]);
    expectValid(g, run(g, 1));
  });

  it("lays out a cycle", () => {
    const g = graph([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]);
    expectValid(g, run(g, 2));
  });

  it("lays out two cycles sharing a room, with a tree", () => {
    const g = graph([[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 2], [5, 6], [6, 7], [6, 8]]);
    expectValid(g, run(g, 3));
  });

  it("lays out the fixture", () => {
    const g = normalize(ruin as DungeonJson);
    expectValid(g, run(g, ruin.seed));
  });

  // Bench M-1: hub #3 has 7 doors; on 4–7 rooms layout seeds 2 and 4 ran out of iterations.
  it.each([2, 4])("lays out a dungeon with a 7-door hub, seed %i", (seed) => {
    const g = normalize(m1 as DungeonJson);
    expectValid(g, run(g, seed));
  }, 20_000);

  it("is deterministic for a seed, corridors included", () => {
    const g = graph([[0, 1], [1, 2], [2, 3], [3, 0], [3, 4]]);
    const where = (l: Layout) => [l.placements.map((pl) => [pl.room, pl.shape.id, pl.at]), l.doors.map((d) => d.corridor)];
    expect(where(run(g, 5))).toEqual(where(run(g, 5)));
    expect(where(run(g, 5))).not.toEqual(where(run(g, 6)));
  });

  it("lays out the fixture without corridors, rooms touching at their doors", () => {
    const g = normalize(ruin as DungeonJson);
    const l = run(g, ruin.seed, direct);
    expectValid(g, l);
    expect(l.doors.every((d) => !d.corridor)).toBe(true);
  });

  it("puts a corridor between about corridorRate of the room pairs, one per pair", () => {
    const g = normalize(ruin as DungeonJson);
    const pairs = (l: Layout) => new Set(l.doors.filter((d) => d.corridor).map((d) => [d.door.a, d.door.b].sort().join("|")));
    const all = new Set(g.doors.filter((d) => d.a !== d.b).map((d) => [d.a, d.b].sort().join("|")));
    expect(pairs(run(g, ruin.seed, { ...defaultConfig, corridorRate: 1 })).size).toBe(all.size);
    expect(pairs(run(g, ruin.seed, { ...defaultConfig, corridorRate: 0 })).size).toBe(0);
    const some = pairs(run(g, ruin.seed));
    expect(some.size).toBeGreaterThan(all.size * 0.8);
    expect(some.size).toBeLessThan(all.size);
  });

  it("gives parallel doors one corridor", () => {
    const g = graph([[0, 1], [1, 2], [2, 0], [1, 0]]);
    const l = run(g, 1, { ...defaultConfig, corridorRate: 1 });
    expectValid(g, l);
    const [c, back] = [l.doors[0]!, l.doors[3]!];
    expect(back.corridor).toMatchObject({ shape: c.corridor!.shape, at: c.corridor!.at });
    expect([back.segment, back.corridor!.segment]).toEqual([c.corridor!.segment, c.segment]); // seen from room 1
  });

  it("keeps rooms that are not neighbours apart when rooms may not touch", () => {
    const g = graph([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [2, 6], [6, 7]]);
    const l = run(g, 4, { ...defaultConfig, roomsCanTouch: false });
    expectValid(g, l);
    const adjacent = new Set(g.doors.filter((d) => !l.doors.find((p) => p.door === d)!.corridor).flatMap((d) => [`${d.a}|${d.b}`, `${d.b}|${d.a}`]));
    const placed = l.placements.map((pl) => [pl.room, translate(pl.shape.outline, pl.at)] as const);
    for (const [a, pa] of placed) {
      for (const [b, pb] of placed) {
        if (a < b && !adjacent.has(`${a}|${b}`)) expect(touch(pa, pb), `rooms ${a} and ${b} touch`).toBe(false);
      }
    }
  });

  it("fails with the chain it got stuck on when out of iterations", () => {
    const g = graph([[0, 1], [1, 2], [2, 3], [3, 0]]);
    const err = (() => {
      try {
        run(g, 1, { ...defaultConfig, maxTotalIterations: 1 });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(LayoutError);
    expect(err).toMatchObject({ chain: 0, rooms: expect.arrayContaining([1, 2, 3, 4]) });
  });
});
