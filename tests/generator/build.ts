import { Graph } from "../../src/engine/generator/graph";
import type { DGraph, DVertex, GObject } from "../../src/engine/generator/types";

export const KEY: GObject = { id: "key-1", type: "key", name: "spam key 1" };
export const START: DVertex = { type: "st", name: "START", nt: false, objects: [] };
export const GOAL: DVertex = { type: "gl", name: "GOAL", nt: false, objects: [] };
export const LOCK: DVertex = { type: "lock", name: "Use spam key 1", nt: false, objects: [KEY], gate: "lock" };
export const PICKUP: DVertex = { type: "key", name: "Get spam key 1", nt: false, objects: [KEY] };
export const room = (type: string): DVertex => ({ type, name: type, nt: false, objects: [] });

// Graph from vertices (ids 0…) and [source, target, oneway?] edges.
export function build(vertices: DVertex[], edges: [number, number, boolean?][]): DGraph {
  const g: DGraph = new Graph();
  for (const v of vertices) g.addVertex({ ...v });
  for (const [s, t, oneway = false] of edges) g.addEdge(s, t, { oneway });
  return g;
}
