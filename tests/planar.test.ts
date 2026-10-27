import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { normalize } from "../src/engine/normalize";
import { faces, NonPlanarError } from "../src/engine/planar";
import type { DungeonJson, RoomGraph } from "../src/engine/types";

type Edge = [number, number];

// Room numbers are id + 100, so error messages can be told apart from ids.
const graph = (edges: Edge[]): RoomGraph => {
  const ids = [...new Set(edges.flat())];
  return {
    rooms: new Map(ids.map((id) => [id, { id, type: "n", number: id + 100, label: `Room ${id}`, objects: [] }])),
    doors: edges.map(([a, b]) => ({ a, b, oneway: false })),
    start: ids[0] ?? 0,
    goal: ids[0] ?? 0,
  };
};

const complete = (n: number): Edge[] => {
  const edges: Edge[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) edges.push([a, b]);
  return edges;
};

const k33: Edge[] = [0, 1, 2].flatMap((a) => [3, 4, 5].map((b): Edge => [a, b]));

const grid = (w: number, h: number): Edge[] => {
  const edges: Edge[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x + 1 < w) edges.push([y * w + x, y * w + x + 1]);
      if (y + 1 < h) edges.push([y * w + x, (y + 1) * w + x]);
    }
  }
  return edges;
};

const sorted = (fs: number[][]) => fs.map((f) => [...f].sort((a, b) => a - b)).sort((a, b) => a.length - b.length || a[0]! - b[0]!);

const key = ([a, b]: Edge) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// Every face is a cycle of the graph, and there are E - V + 1 inner faces (connected graph).
const expectValidFaces = (edges: Edge[], fs: number[][]) => {
  const keys = new Set(edges.map(key));
  for (const f of fs) {
    expect(new Set(f).size).toBe(f.length);
    expect(f.length).toBeGreaterThanOrEqual(3);
    f.forEach((v, i) => expect(keys.has(key([v, f[(i + 1) % f.length]!]))).toBe(true));
  }
  expect(fs).toHaveLength(keys.size - new Set(edges.flat()).size + 1);
};

describe("faces: planar graphs", () => {
  it("has no faces for a tree", () => {
    expect(faces(graph([[0, 1], [1, 2], [1, 3], [3, 4]]))).toEqual([]);
  });

  it("keeps one face for a single cycle", () => {
    expect(sorted(faces(graph([[0, 1], [1, 2], [2, 3], [3, 0]])))).toEqual([[0, 1, 2, 3]]);
  });

  it("drops the outer face of a square with a diagonal", () => {
    expect(sorted(faces(graph([[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]])))).toEqual([
      [0, 1, 2],
      [0, 2, 3],
    ]);
  });

  it("embeds K4", () => {
    const fs = faces(graph(complete(4)));
    expect(fs.map((f) => f.length)).toEqual([3, 3, 3]);
    expectValidFaces(complete(4), fs);
  });

  it("embeds the cube", () => {
    const cube: Edge[] = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const fs = faces(graph(cube));
    expect(fs.map((f) => f.length)).toEqual([4, 4, 4, 4, 4]);
    expectValidFaces(cube, fs);
  });

  it("drops the outer face of a grid, not an inner one", () => {
    const fs = faces(graph(grid(4, 3)));
    expect(fs.map((f) => f.length)).toEqual([4, 4, 4, 4, 4, 4]);
    expectValidFaces(grid(4, 3), fs);
  });

  it("keeps tree rooms out of faces", () => {
    // triangle 0-1-2, bridge 2-3, triangle 3-4-5, pendant rooms 6 and 7
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 3], [0, 6], [4, 7]];
    expect(sorted(faces(graph(edges)))).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it("keeps both cycles of two cycles sharing one room", () => {
    const edges: Edge[] = [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 2]];
    expect(sorted(faces(graph(edges)))).toEqual([
      [0, 1, 2],
      [2, 3, 4, 5],
    ]);
  });

  it("ignores duplicate doors", () => {
    expect(sorted(faces(graph([[0, 1], [1, 2], [2, 0], [1, 0]])))).toEqual([[0, 1, 2]]);
  });

  it("embeds random subgraphs of a grid", () => {
    let s = 42;
    const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31), s / 2 ** 31);
    for (let run = 0; run < 50; run++) {
      // keep a spanning path so the graph stays connected, drop other edges at random
      const edges = grid(6, 5).filter(([a, b]) => b === a + 1 && Math.floor(a / 6) === Math.floor(b / 6) || a % 6 === 0 && b === a + 6 || rand() < 0.6);
      expectValidFaces(edges, faces(graph(edges)));
    }
  });

  it("embeds a fragment that fits one face before the others", () => {
    // planar, but fails if fragments are embedded in input order (found by random search)
    const edges: Edge[] = [
      [0, 1], [0, 4], [1, 2], [1, 6], [2, 3], [2, 6], [3, 7], [4, 8], [4, 9],
      [5, 6], [5, 10], [6, 7], [6, 10], [6, 11], [7, 11], [8, 9], [9, 10], [10, 11],
    ];
    expectValidFaces(edges, faces(graph(edges)));
  });

  it("finds the one-way loop in the ruin fixture", () => {
    const g = normalize(ruin as DungeonJson);
    const fs = faces(g);
    expectValidFaces(g.doors.map((d): Edge => [d.a, d.b]), fs);
    expect(sorted(fs)).toContainEqual([23, 24, 29]);
  });
});

describe("faces: non-planar graphs", () => {
  const conflict = (edges: Edge[]) => {
    try {
      faces(graph(edges));
    } catch (e) {
      expect(e).toBeInstanceOf(NonPlanarError);
      return (e as NonPlanarError).doors.map(key).sort();
    }
    throw new Error("expected NonPlanarError");
  };

  it("rejects K5 and names all its doors", () => {
    expect(conflict(complete(5))).toEqual(complete(5).map(key).sort());
  });

  it("rejects K3,3 and names all its doors", () => {
    expect(conflict(k33)).toEqual(k33.map(key).sort());
  });

  it("names only the conflicting doors, not the rest of the dungeon", () => {
    const edges: Edge[] = [...complete(5), [4, 5], [5, 6], [6, 7], [7, 4], [0, 8]];
    expect(conflict(edges)).toEqual(complete(5).map(key).sort());
  });

  it("names a minimal conflict in the Petersen graph", () => {
    const petersen: Edge[] = [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 0],
      [0, 5], [1, 6], [2, 7], [3, 8], [4, 9],
      [5, 7], [7, 9], [9, 6], [6, 8], [8, 5],
    ];
    const doors = conflict(petersen);
    expect(doors.length).toBeLessThan(15);
    // removing any named door makes the rest planar
    for (const d of doors) {
      const rest = doors.filter((x) => x !== d).map((k) => k.split("-").map(Number) as Edge);
      expect(() => faces(graph(rest))).not.toThrow();
    }
  });

  it("uses room numbers in the message", () => {
    expect(() => faces(graph(k33))).toThrow(/not planar.*100–103/);
  });
});
