import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import m1 from "./fixtures/m-1.json";
import { normalize } from "../src/engine/normalize";
import { faces } from "../src/engine/planar";
import { chains } from "../src/engine/chains";
import { defaultConfig, type LayoutConfig } from "../src/engine/config";
import { poolKeys, shapePool } from "../src/engine/shapes";
import { layout, LayoutError, type Layout } from "../src/engine/layout";
import { overlapArea, translate, walls, type Polygon, type Segment } from "../src/engine/geometry";
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

// No two rooms overlap; every door is doorLength long and on a wall of both of its rooms.
const expectValid = (g: RoomGraph, l: Layout) => {
  const outline = new Map(l.placements.map((pl) => [pl.room, translate(pl.shape.outline, pl.at)]));
  expect([...outline.keys()].sort((a, b) => a - b)).toEqual([...g.rooms.keys()].sort((a, b) => a - b));
  const rooms = [...outline];
  rooms.forEach(([a, pa], i) => {
    for (const [b, pb] of rooms.slice(i + 1)) expect(overlapArea(pa, pb), `rooms ${a} and ${b} overlap`).toBe(0);
  });
  expect(l.doors.map((d) => d.door)).toEqual(g.doors);
  for (const { door, segment } of l.doors) {
    const length = segment.to.x - segment.from.x + segment.to.y - segment.from.y;
    expect(length).toBe(defaultConfig.doorLength);
    expect(onWall(outline.get(door.a)!, segment), `door ${door.a}–${door.b} not on ${door.a}`).toBe(true);
    expect(onWall(outline.get(door.b)!, segment), `door ${door.a}–${door.b} not on ${door.b}`).toBe(true);
  }
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

  it("is deterministic for a seed", () => {
    const g = graph([[0, 1], [1, 2], [2, 3], [3, 0], [3, 4]]);
    const where = (l: Layout) => l.placements.map((pl) => [pl.room, pl.shape.id, pl.at]);
    expect(where(run(g, 5))).toEqual(where(run(g, 5)));
    expect(where(run(g, 5))).not.toEqual(where(run(g, 6)));
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
