// Directed multigraph for the generator (replaces igraph). Vertex and edge ids are stable and
// increase with insertion, so iteration order is insertion order and survives deletions.
export type Edge<E> = { id: number; source: number; target: number; attrs: E };

export class Graph<V, E> {
  private nextVertex = 0;
  private nextEdge = 0;
  private readonly vs = new Map<number, V>();
  private readonly es = new Map<number, Edge<E>>();
  private readonly inc = new Map<number, Set<number>>(); // vertex → incident edge ids

  get vertexCount(): number {
    return this.vs.size;
  }

  addVertex(attrs: V): number {
    const id = this.nextVertex++;
    this.vs.set(id, attrs);
    this.inc.set(id, new Set());
    return id;
  }

  vertex(id: number): V {
    const v = this.vs.get(id);
    if (v === undefined) throw new Error(`No vertex ${id}`);
    return v;
  }

  vertices(): [number, V][] {
    return [...this.vs];
  }

  deleteVertex(id: number): void {
    for (const e of this.incident(id)) this.deleteEdge(e.id);
    this.vs.delete(id);
    this.inc.delete(id);
  }

  addEdge(source: number, target: number, attrs: E): number {
    this.vertex(source);
    this.vertex(target);
    const id = this.nextEdge++;
    this.es.set(id, { id, source, target, attrs });
    this.inc.get(source)!.add(id);
    this.inc.get(target)!.add(id);
    return id;
  }

  deleteEdge(id: number): void {
    const e = this.es.get(id);
    if (!e) return;
    this.es.delete(id);
    this.inc.get(e.source)?.delete(id);
    this.inc.get(e.target)?.delete(id);
  }

  edges(): Edge<E>[] {
    return [...this.es.values()];
  }

  // Edges at the vertex in edge order (ids only grow, so the set is in order); "in" ends at it,
  // "out" starts at it.
  incident(id: number, mode: "in" | "out" | "all" = "all"): Edge<E>[] {
    const set = this.inc.get(id);
    if (!set) throw new Error(`No vertex ${id}`);
    return [...set].map((e) => this.es.get(e)!).filter((e) => mode === "all" || (mode === "in" ? e.target === id : e.source === id));
  }

  // Drops self-loops and repeated source → target edges into the first, whose attributes combine
  // takes (default: the first's); a → b and b → a both stay.
  simplify(combine: (kept: E, dropped: E) => E = (kept) => kept): void {
    const first = new Map<string, Edge<E>>();
    for (const e of this.edges()) {
      const key = `${e.source}>${e.target}`;
      const kept = first.get(key);
      if (e.source !== e.target && !kept) first.set(key, e);
      else {
        if (kept) kept.attrs = combine(kept.attrs, e.attrs);
        this.deleteEdge(e.id);
      }
    }
  }

  // Dijkstra ignoring directions, from source to each target (Infinity when unreachable).
  distances(source: number, targets: number[], weight: (e: Edge<E>) => number): number[] {
    const dist = new Map<number, number>([[source, 0]]);
    const done = new Set<number>();
    for (;;) {
      let u: number | undefined;
      for (const [v, d] of dist) if (!done.has(v) && (u === undefined || d < dist.get(u)!)) u = v;
      if (u === undefined) break;
      done.add(u);
      for (const e of this.incident(u)) {
        const v = e.source === u ? e.target : e.source;
        const d = dist.get(u)! + weight(e);
        if (d < (dist.get(v) ?? Infinity)) dist.set(v, d);
      }
    }
    return targets.map((t) => dist.get(t) ?? Infinity);
  }
}
