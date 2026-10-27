import type { Edge } from "./graph";
import type { DEdge, DGraph } from "./types";

// Plain rooms merged with a neighbour of the same type (Python utils/graph_utils.py MERGE_TYPES).
export const MERGE_TYPES = ["e", "n", "p", "t", "c"];

// First two-way edge between two rooms of the same MERGE_TYPES type, neither holding objects. One-way
// edges never merge, so a one-way path never turns two-way; nor do the two ends of one gate, which
// would put the gate inside a room (a same-type loop around it, step 13).
function mergeable(g: DGraph): Edge<DEdge> | undefined {
  const gated = new Set<string>();
  for (const [id, v] of g.vertices()) {
    if (!v.gate) continue;
    const ends = g.incident(id).map((e) => (e.source === id ? e.target : e.source));
    for (const a of ends) for (const b of ends) gated.add(`${a},${b}`);
  }
  return g.edges().find((e) => {
    const [s, t] = [g.vertex(e.source), g.vertex(e.target)];
    return (
      e.source !== e.target &&
      s.type === t.type &&
      MERGE_TYPES.includes(s.type) &&
      !e.attrs.oneway &&
      !s.objects.length &&
      !t.objects.length &&
      !gated.has(`${e.source},${e.target}`)
    );
  });
}

// Python Dungeon._reduce_graph: the kept room takes the edges of the dropped one, then duplicates
// and self-loops go. Gate–gate edges cannot come out of the grammar: assert it.
export function reduce(g: DGraph): void {
  for (let e = mergeable(g); e; e = mergeable(g)) {
    const [keep, drop] = [e.source, e.target];
    for (const d of g.incident(drop)) {
      const [s, t] = [d.source === drop ? keep : d.source, d.target === drop ? keep : d.target];
      if (s !== t) g.addEdge(s, t, { ...d.attrs });
    }
    g.deleteVertex(drop);
  }
  g.simplify();
  for (const e of g.edges()) {
    if (g.vertex(e.source).gate && g.vertex(e.target).gate) throw new Error(`Gate chain: gates ${e.source} and ${e.target} are joined`);
  }
}
