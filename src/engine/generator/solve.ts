import type { DGraph, DVertex } from "./types";

// Solvability and steps (Python utils/graph_utils.py).

export function find(g: DGraph, type: string): number {
  const v = g.vertices().find(([, x]) => x.type === type);
  if (!v) throw new Error(`No ${type} vertex`);
  return v[0];
}

// A gate opens once all its objects are collected; off gates start open, secrets need nothing.
const canEnter = (v: DVertex, collected: Set<string>): boolean =>
  !v.gate || v.gate === "secret" || v.gate === "off" || v.objects.every((o) => collected.has(o.id));

// Walkable neighbours: edges are two-way unless one-way.
function walks(g: DGraph): Map<number, Set<number>> {
  const w = new Map(g.vertices().map(([id]) => [id, new Set<number>()]));
  for (const e of g.edges()) {
    w.get(e.source)!.add(e.target);
    if (!e.attrs.oneway) w.get(e.target)!.add(e.source);
  }
  return w;
}

// Explore from START collecting objects, again from every reached vertex until nothing changes.
function explore(g: DGraph, w: Map<number, Set<number>>): { reached: Set<number>; collected: Set<string> } {
  const reached = new Set([find(g, "st")]);
  const collected = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    const stack = [...reached];
    while (stack.length) {
      const v = stack.pop()!;
      const x = g.vertex(v);
      if (!x.gate) for (const o of x.objects) collected.add(o.id);
      for (const n of w.get(v)!) {
        if (reached.has(n) || !canEnter(g.vertex(n), collected)) continue;
        reached.add(n);
        stack.push(n);
        changed = true;
      }
    }
  }
  return { reached, collected };
}

export const reachable = (g: DGraph): Set<number> => explore(g, walks(g)).reached;

// Empty when the dungeon can be finished; else an unreachable GOAL and each closed gate next to the
// reached area with the objects it misses.
export function unsolvableReasons(g: DGraph): string[] {
  const w = walks(g);
  const { reached, collected } = explore(g, w);
  const reasons = reached.has(find(g, "gl")) ? [] : ["GOAL unreachable"];
  const blocked = new Set<number>();
  for (const v of reached) for (const n of w.get(v)!) if (!reached.has(n)) blocked.add(n);
  for (const v of [...blocked].sort((a, b) => a - b)) {
    const gate = g.vertex(v);
    const missing = gate.objects.filter((o) => !collected.has(o.id)).map((o) => o.name);
    reasons.push(`${gate.name} needs ${missing.join(" + ")}`);
  }
  return [...new Set(reasons)];
}

// Shortest steps ignoring directions; crossing a gate (two legs of 0.5) is one step.
export const steps = (g: DGraph, source: number, targets: number[]): number[] =>
  g.distances(source, targets, (e) => (g.vertex(e.source).gate || g.vertex(e.target).gate ? 0.5 : 1));

// Position between START (0) and the boss room (1), in steps.
export function progress(g: DGraph, v: number): number {
  const [fromStart, toBoss] = steps(g, v, [find(g, "st"), find(g, "eb")]) as [number, number];
  return fromStart / (fromStart + toBoss);
}
