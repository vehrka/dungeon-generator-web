import type { RoomGraph, RoomId } from "./types";

export type Chain = { rooms: RoomId[]; fromFace: boolean };

type Candidate = Chain & { oldestNeighbour: number };

// Chain decomposition, thesis 2.3.2 (Algorithms 2 and 4). `faces` are the inner faces from planar.ts.
// Chains come out in layout order: every room after the first has a neighbour that comes before it.
export function chains(graph: RoomGraph, faces: RoomId[][], maxTreeSize = 8): Chain[] {
  const adj = new Map<RoomId, RoomId[]>([...graph.rooms.keys()].map((id) => [id, []]));
  for (const { a, b } of graph.doors) {
    if (a === b || adj.get(a)!.includes(b)) continue;
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }

  const covered = new Map<RoomId, number>(); // room → chain number
  let remaining = faces;
  const result: Chain[] = [];
  const add = (chain: Chain) => {
    chain.rooms.forEach((v) => covered.set(v, result.length));
    result.push({ rooms: chain.rooms, fromFace: chain.fromFace });
    remaining = remaining.filter((f) => f.some((v) => !covered.has(v)));
  };
  const inFace = (v: RoomId) => remaining.some((f) => f.includes(v));

  // Edgar's GetCycleComponent: next room is the one with a covered or already ordered neighbour.
  const cycle = (face: RoomId[]): Candidate => {
    const left = face.filter((v) => !covered.has(v));
    const order = new Map<RoomId, number>();
    while (left.length > 0) {
      const rank = (v: RoomId) =>
        Math.min(...adj.get(v)!.map((n) => (covered.has(n) ? -1 : (order.get(n) ?? Infinity))));
      let best = 0;
      left.forEach((v, i) => rank(v) < rank(left[best]!) && (best = i));
      order.set(left[best]!, order.size);
      left.splice(best, 1);
    }
    const rooms = [...order.keys()];
    return { rooms, fromFace: true, oldestNeighbour: oldestNeighbour(rooms) };
  };

  // BFS from all starting rooms. A room joins if it is uncovered and in no remaining face (thesis
  // 2.3.2, tree chains). Two candidates could only meet on a cycle, so they never overlap.
  const tree = (starts: RoomId[]): Candidate => {
    const rooms = [...starts];
    const queue = [...starts];
    for (let v = queue.shift(); v !== undefined && rooms.length < maxTreeSize; v = queue.shift()) {
      for (const n of adj.get(v)!) {
        if (rooms.includes(n) || covered.has(n) || inFace(n)) continue;
        rooms.push(n);
        queue.push(n);
        if (rooms.length >= maxTreeSize) break;
      }
    }
    return { rooms, fromFace: false, oldestNeighbour: oldestNeighbour(rooms) };
  };

  const oldestNeighbour = (rooms: RoomId[]) =>
    Math.min(...rooms.flatMap((v) => adj.get(v)!.flatMap((n) => (covered.has(n) ? [covered.get(n)!] : []))));

  // First chain: the smallest face, else a tree from a leaf.
  if (remaining.length > 0) {
    add({ rooms: remaining.reduce((a, b) => (b.length < a.length ? b : a)), fromFace: true });
  } else if (graph.rooms.size > 0) {
    const ids = [...graph.rooms.keys()];
    add(tree([ids.find((v) => adj.get(v)!.length === 1) ?? ids[0]!]));
  }

  while (covered.size < graph.rooms.size) {
    const cycles: Candidate[] = [];
    const trees: Candidate[] = [];
    const taken = new Set<RoomId>();
    for (const v of covered.keys()) {
      const starts: RoomId[] = [];
      for (const n of adj.get(v)!) {
        if (covered.has(n) || taken.has(n)) continue;
        const face = remaining.find((f) => f.includes(n));
        if (face) {
          const c = cycle(face);
          cycles.push(c);
          c.rooms.forEach((r) => taken.add(r));
        } else {
          starts.push(n);
        }
      }
      if (starts.length > 0) {
        const t = tree(starts);
        trees.push(t);
        t.rooms.forEach((r) => taken.add(r));
      }
    }

    if (cycles.length > 0) {
      add(cycles.reduce((a, b) => (b.rooms.length < a.rooms.length ? b : a)));
      continue;
    }
    if (trees.length === 0) throw new Error("Graph is not connected");

    // Tree next to the oldest chain, then the largest; merge smaller trees into it up to maxTreeSize.
    trees.sort((a, b) => a.oldestNeighbour - b.oldestNeighbour || b.rooms.length - a.rooms.length);
    const [best, ...rest] = trees as [Candidate, ...Candidate[]];
    if (best.rooms.length < maxTreeSize) {
      for (const t of rest) if (best.rooms.length + t.rooms.length <= maxTreeSize) best.rooms.push(...t.rooms);
    }
    add(best);
  }
  return result;
}
