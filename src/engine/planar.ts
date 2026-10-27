import type { RoomGraph, RoomId } from "./types";

type Edge = [RoomId, RoomId];

export class NonPlanarError extends Error {
  constructor(readonly doors: Edge[]) {
    super(`Graph is not planar`);
  }
}

// Inner faces of a planar embedding, as room cycles. Each biconnected block is embedded on its own
// and its largest face dropped as the outer face, so tree rooms never end up in a face.
export function faces(graph: RoomGraph): RoomId[][] {
  const edges = distinctEdges(graph.doors.map((d): Edge => [d.a, d.b]));
  const result = embed(edges);
  if (result) return result;

  const doors = conflict(edges);
  const number = (id: RoomId) => graph.rooms.get(id)?.number ?? id;
  const error = new NonPlanarError(doors);
  error.message = `Graph is not planar. Conflicting doors: ${doors.map(([a, b]) => `${number(a)}–${number(b)}`).join(", ")}`;
  throw error;
}

function distinctEdges(edges: Edge[]): Edge[] {
  const seen = new Set<string>();
  return edges.filter(([a, b]) => {
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function embed(edges: Edge[]): RoomId[][] | null {
  const result: RoomId[][] = [];
  for (const block of blocks(edges)) {
    if (block.length < 3) continue; // a bridge has no faces
    const fs = embedBlock(block);
    if (!fs) return null;
    let outer = 0;
    fs.forEach((f, i) => f.length > fs[outer]!.length && (outer = i));
    result.push(...fs.filter((_, i) => i !== outer));
  }
  return result;
}

// Smallest edge set that is still not planar (a Kuratowski subdivision): drop every edge we can.
function conflict(edges: Edge[]): Edge[] {
  let kept = edges;
  for (const e of edges) {
    const without = kept.filter((x) => x !== e);
    if (!embed(without)) kept = without;
  }
  return kept;
}

function adjacency(edges: Edge[]): Map<RoomId, RoomId[]> {
  const adj = new Map<RoomId, RoomId[]>();
  for (const [a, b] of edges) {
    adj.set(a, [...(adj.get(a) ?? []), b]);
    adj.set(b, [...(adj.get(b) ?? []), a]);
  }
  return adj;
}

// Biconnected components (Tarjan), as edge lists.
function blocks(edges: Edge[]): Edge[][] {
  const adj = adjacency(edges);
  const depth = new Map<RoomId, number>();
  const low = new Map<RoomId, number>();
  const stack: Edge[] = [];
  const result: Edge[][] = [];

  const visit = (v: RoomId, parent: RoomId | undefined, d: number) => {
    depth.set(v, d);
    low.set(v, d);
    for (const w of adj.get(v)!) {
      if (w === parent) continue;
      if (!depth.has(w)) {
        stack.push([v, w]);
        visit(w, v, d + 1);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
        if (low.get(w)! >= d) {
          const block: Edge[] = [];
          let e: Edge;
          do {
            e = stack.pop()!;
            block.push(e);
          } while (e[0] !== v || e[1] !== w);
          result.push(block);
        }
      } else if (depth.get(w)! < d) {
        stack.push([v, w]);
        low.set(v, Math.min(low.get(v)!, depth.get(w)!));
      }
    }
  };

  for (const v of adj.keys()) if (!depth.has(v)) visit(v, undefined, 0);
  return result;
}

type Fragment = { attachments: RoomId[]; path: () => RoomId[] };

// Demoucron–Malgrange–Pertuiset: start from a cycle, then embed one path of a fragment at a time
// in a face that holds all its attachments. Returns null if some fragment fits no face.
function embedBlock(edges: Edge[]): RoomId[][] | null {
  const adj = adjacency(edges);
  const cycle = findCycle(adj);
  const placed = new Set<RoomId>(cycle);
  const placedEdges = new Set<string>();
  const ek = (a: RoomId, b: RoomId) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  cycle.forEach((v, i) => placedEdges.add(ek(v, cycle[(i + 1) % cycle.length]!)));
  const fs: RoomId[][] = [cycle, [...cycle]];

  while (placedEdges.size < edges.length) {
    let best: { fragment: Fragment; face: number } | undefined;
    for (const fragment of fragments(edges, adj, placed, placedEdges, ek)) {
      const fit = fs.flatMap((f, i) => (fragment.attachments.every((a) => f.includes(a)) ? [i] : []));
      if (fit.length === 0) return null;
      if (!best || fit.length === 1) best = { fragment, face: fit[0]! };
      if (fit.length === 1) break;
    }

    const path = best!.fragment.path();
    const face = fs[best!.face]!;
    const [u, w] = [path[0]!, path[path.length - 1]!];
    const inner = path.slice(1, -1);
    fs[best!.face] = [...walk(face, u, w), ...[...inner].reverse()];
    fs.push([...walk(face, w, u), ...inner]);
    inner.forEach((v) => placed.add(v));
    path.slice(1).forEach((v, i) => placedEdges.add(ek(path[i]!, v)));
  }
  return fs;
}

// Face vertices from u forward to w, both included.
function walk(face: RoomId[], u: RoomId, w: RoomId): RoomId[] {
  const out: RoomId[] = [];
  for (let i = face.indexOf(u); ; i = (i + 1) % face.length) {
    out.push(face[i]!);
    if (face[i] === w) return out;
  }
}

function findCycle(adj: Map<RoomId, RoomId[]>): RoomId[] {
  const start = adj.keys().next().value!;
  const parent = new Map<RoomId, RoomId | undefined>([[start, undefined]]);
  const path: RoomId[] = [];
  const dfs = (v: RoomId): RoomId[] | undefined => {
    path.push(v);
    for (const w of adj.get(v)!) {
      if (w === parent.get(v)) continue;
      if (parent.has(w)) return path.slice(path.indexOf(w));
      parent.set(w, v);
      const c = dfs(w);
      if (c) return c;
    }
    path.pop();
  };
  return dfs(start)!; // a block with 3+ edges always has a cycle
}

function fragments(
  edges: Edge[],
  adj: Map<RoomId, RoomId[]>,
  placed: Set<RoomId>,
  placedEdges: Set<string>,
  ek: (a: RoomId, b: RoomId) => string,
): Fragment[] {
  // chords: unplaced edges between placed rooms
  const result: Fragment[] = edges
    .filter(([a, b]) => placed.has(a) && placed.has(b) && !placedEdges.has(ek(a, b)))
    .map(([a, b]) => ({ attachments: [a, b], path: () => [a, b] }));

  // components of unplaced rooms, attached to the placed rooms they touch
  const seen = new Set<RoomId>();
  for (const v of adj.keys()) {
    if (placed.has(v) || seen.has(v)) continue;
    const inside = new Set<RoomId>([v]);
    const attachments = new Set<RoomId>();
    const queue = [v];
    for (let x = queue.shift(); x !== undefined; x = queue.shift()) {
      for (const y of adj.get(x)!) {
        if (placed.has(y)) attachments.add(y);
        else if (!inside.has(y)) inside.add(y), queue.push(y);
      }
    }
    inside.forEach((x) => seen.add(x));
    const att = [...attachments];
    result.push({ attachments: att, path: () => fragmentPath(att[0]!, inside, adj) });
  }
  return result;
}

// BFS from attachment u through the fragment's rooms to any other attachment.
function fragmentPath(u: RoomId, inside: Set<RoomId>, adj: Map<RoomId, RoomId[]>): RoomId[] {
  const prev = new Map<RoomId, RoomId>();
  const queue = adj.get(u)!.filter((x) => inside.has(x));
  queue.forEach((x) => prev.set(x, u));
  for (let x = queue.shift(); x !== undefined; x = queue.shift()) {
    for (const y of adj.get(x)!) {
      if (inside.has(y)) {
        if (!prev.has(y)) prev.set(y, x), queue.push(y);
      } else if (y !== u) {
        const path = [y, x];
        for (let p = prev.get(x)!; ; p = prev.get(p)!) {
          path.push(p);
          if (p === u) return path.reverse();
        }
      }
    }
  }
  throw new Error("fragment in a block must reach a second attachment");
}
