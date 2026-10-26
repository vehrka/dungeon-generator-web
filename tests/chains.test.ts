import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { normalize } from "../src/engine/normalize";
import { faces } from "../src/engine/planar";
import { chains, type Chain } from "../src/engine/chains";
import type { DungeonJson, RoomGraph } from "../src/engine/types";

type Edge = [number, number];

const graph = (edges: Edge[], extra: number[] = []): RoomGraph => {
  const ids = [...new Set([...edges.flat(), ...extra])];
  return {
    rooms: new Map(ids.map((id) => [id, { id, type: "n", number: id, label: `Room ${id}`, objects: [] }])),
    doors: edges.map(([a, b]) => ({ a, b, oneway: false })),
    start: ids[0] ?? 0,
    goal: ids[0] ?? 0,
  };
};

const decompose = (g: RoomGraph) => chains(g, faces(g));

const neighbours = (g: RoomGraph, v: number) =>
  g.doors.flatMap((d) => (d.a === v ? [d.b] : d.b === v ? [d.a] : []));

// Every room exactly once, each room after the very first has a neighbour placed before it
// (so every chain neighbours an earlier one), trees ≤ 8 rooms.
const expectValid = (g: RoomGraph, cs: Chain[]) => {
  const order = cs.flatMap((c) => c.rooms);
  expect([...order].sort((a, b) => a - b)).toEqual([...g.rooms.keys()].sort((a, b) => a - b));
  order.slice(1).forEach((v, i) => {
    const before = new Set(order.slice(0, i + 1));
    expect(neighbours(g, v).some((n) => before.has(n)), `room ${v} has no earlier neighbour`).toBe(true);
  });
  for (const c of cs) if (!c.fromFace) expect(c.rooms.length).toBeLessThanOrEqual(8);
};

describe("chains", () => {
  it("starts a tree from a leaf when there are no cycles", () => {
    const g = graph([[0, 1], [1, 2], [2, 3]]);
    const cs = decompose(g);
    expect(cs).toEqual([{ rooms: [0, 1, 2, 3], fromFace: false }]);
  });

  it("handles a single room", () => {
    expect(decompose(graph([], [5]))).toEqual([{ rooms: [5], fromFace: false }]);
  });

  it("cuts long trees at 8 rooms", () => {
    const path = Array.from({ length: 19 }, (_, i): Edge => [i, i + 1]);
    const g = graph(path);
    const cs = decompose(g);
    expect(cs.map((c) => c.rooms.length)).toEqual([8, 8, 4]);
    expectValid(g, cs);
  });

  it("starts with the smallest face, then the next cycle before any tree", () => {
    // square 0-3, triangle 3-4-5 sharing room 3, pendant 6 on room 0
    const g = graph([[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 3], [0, 6]]);
    const cs = decompose(g);
    expect(cs.map((c) => c.fromFace)).toEqual([true, true, false]);
    expect([...cs[0]!.rooms].sort()).toEqual([3, 4, 5]);
    expect([...cs[1]!.rooms].sort()).toEqual([0, 1, 2]);
    expect(cs[2]!.rooms).toEqual([6]);
    expectValid(g, cs);
  });

  it("picks the smallest cycle candidate", () => {
    // triangle 0-1-2; pentagon 0-5-6-7-1 (3 new rooms) found first, square 1-8-9-2 (2 new rooms)
    const g = graph([[0, 1], [1, 2], [2, 0], [0, 5], [5, 6], [6, 7], [7, 1], [1, 8], [8, 9], [9, 2]]);
    const cs = decompose(g);
    expect([...cs[1]!.rooms].sort()).toEqual([8, 9]);
    expectValid(g, cs);
  });

  it("keeps rooms of a remaining face out of a tree", () => {
    // triangle 0-1-2, path 2-3-4, square 4-5-6-7
    const g = graph([[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 4]]);
    const cs = decompose(g);
    expect(cs.map((c) => [c.fromFace, [...c.rooms].sort()])).toEqual([
      [true, [0, 1, 2]],
      [false, [3]],
      [true, [4, 5, 6, 7]],
    ]);
    expectValid(g, cs);
  });

  it("orders cycle rooms so each follows a neighbour", () => {
    // square 0-1-2-3 first (smallest), then hexagon 1-4-5-6-7-2 attached on edge 1-2
    const g = graph([[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 5], [5, 6], [6, 7], [7, 2]]);
    const cs = decompose(g);
    expect(cs[1]!.fromFace).toBe(true);
    expectValid(g, cs);
  });

  it("grows one tree from all uncovered neighbours of a room (thesis fig. 10)", () => {
    // triangle 0-1-2; room 2 has branches 3-5 and 4-6
    const g = graph([[0, 1], [1, 2], [2, 0], [2, 3], [2, 4], [3, 5], [4, 6]]);
    const cs = decompose(g);
    expect(cs[1]).toEqual({ rooms: [3, 4, 5, 6], fromFace: false });
  });

  it("merges small trees up to 8 rooms", () => {
    // triangle 0-1-2, one pendant room on each corner
    const g = graph([[0, 1], [1, 2], [2, 0], [0, 3], [1, 4], [2, 5]]);
    const cs = decompose(g);
    expect(cs).toHaveLength(2);
    expect([...cs[1]!.rooms].sort()).toEqual([3, 4, 5]);
  });

  it("prefers the tree next to the oldest chain, then the largest", () => {
    // triangle 0-1-2 (chain 0), square 2-3-4-5 (chain 1); branch of 5 rooms on 0, branch of 7 on 4
    const branch = (from: number, first: number, n: number): Edge[] =>
      Array.from({ length: n }, (_, i): Edge => [i === 0 ? from : first + i - 1, first + i]);
    const g = graph([
      [0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 2],
      ...branch(0, 10, 5),
      ...branch(4, 20, 7),
    ]);
    const cs = decompose(g);
    expect(cs[2]!.rooms[0]).toBe(10);
    expectValid(g, cs);
  });

  it("decomposes the ruin fixture", () => {
    const g = normalize(ruin as DungeonJson);
    const cs = decompose(g);
    expect([...cs[0]!.rooms].sort((a, b) => a - b)).toEqual([23, 24, 29]);
    expect(cs[0]!.fromFace).toBe(true);
    expectValid(g, cs);
  });

  it("is valid on random connected graphs", () => {
    let s = 3;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31), s / 2 ** 31);
    for (let run = 0; run < 100; run++) {
      // random tree plus a few chords on a grid, so it stays planar
      const w = 6;
      const edges: Edge[] = [];
      for (let v = 1; v < 30; v++) {
        const left = v % w > 0 ? v - 1 : -1;
        const up = v >= w ? v - w : -1;
        const pick = left >= 0 && (up < 0 || rand() < 0.5) ? left : up;
        edges.push([pick, v]);
        const other = pick === left ? up : left;
        if (other >= 0 && rand() < 0.15) edges.push([other, v]);
      }
      const g = graph(edges);
      expectValid(g, decompose(g));
    }
  });
});
