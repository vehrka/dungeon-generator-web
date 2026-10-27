import { describe, expect, it } from "vitest";
import { Graph } from "../../src/engine/generator/graph";

const path = (n: number, w = 1) => {
  const g = new Graph<string, number>();
  for (let i = 0; i < n; i++) g.addVertex(`v${i}`);
  for (let i = 0; i + 1 < n; i++) g.addEdge(i, i + 1, w);
  return g;
};

describe("graph", () => {
  it("keeps insertion order across deletions", () => {
    const g = path(4);
    g.deleteVertex(1);
    const v = g.addVertex("v4");
    expect(v).toBe(4);
    expect(g.vertices().map(([id]) => id)).toEqual([0, 2, 3, 4]);
    expect(g.edges().map((e) => [e.source, e.target])).toEqual([[2, 3]]);
    expect(() => g.vertex(1)).toThrow("No vertex 1");
  });

  it("lists incident edges by mode in edge order", () => {
    const g = path(3);
    g.addEdge(2, 1, 7);
    expect(g.incident(1, "in").map((e) => e.source)).toEqual([0, 2]);
    expect(g.incident(1, "out").map((e) => e.target)).toEqual([2]);
    expect(g.incident(1).map((e) => e.id)).toEqual([0, 1, 2]);
  });

  it("simplify drops same-direction duplicates and self-loops, keeping the first", () => {
    const g = path(2, 1);
    g.addEdge(0, 1, 2);
    g.addEdge(1, 0, 3);
    g.addEdge(1, 1, 4);
    g.simplify();
    expect(g.edges().map((e) => [e.source, e.target, e.attrs])).toEqual([
      [0, 1, 1],
      [1, 0, 3],
    ]);
  });

  it("distances are weighted and undirected", () => {
    const g = path(4);
    g.addEdge(3, 0, 10);
    g.addVertex("lonely");
    expect(g.distances(3, [0, 1, 3, 4], (e) => e.attrs)).toEqual([3, 2, 0, Infinity]);
    expect(g.distances(0, [3], (e) => (e.attrs === 10 ? 0.5 : e.attrs))).toEqual([0.5]);
  });
});
