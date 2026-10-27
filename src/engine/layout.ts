import type { Chain } from "./chains";
import type { LayoutConfig } from "./config";
import { configSpaces, doorAt, maximumIntersection } from "./configSpace";
import { centre, energy, isValid, place, roomEnergy, terms, type EnergyContext, type LayoutState } from "./energy";
import { bbox, type Point, type Segment } from "./geometry";
import { rng, shuffle, type Rng } from "./rng";
import { poolId, poolKeys, type Shape, type ShapePool } from "./shapes";
import type { Door, RoomGraph, RoomId } from "./types";

export type Placement = { room: RoomId; shape: Shape; at: Point };
export type PlacedDoor = { door: Door; segment: Segment }; // segment in layout coordinates
export type Layout = { placements: Placement[]; doors: PlacedDoor[] };

export class LayoutError extends Error {
  constructor(
    readonly chain: number, // index of the deepest chain the planner could not lay out
    readonly rooms: number[], // its room numbers
  ) {
    super(`No layout found: stuck on chain ${chain + 1} (rooms ${rooms.join(", ")}). Try another layout seed.`);
  }
}

type Context = EnergyContext & {
  config: LayoutConfig;
  r: Rng;
  neighbours: Map<RoomId, RoomId[]>;
  shapes: Map<RoomId, Shape[]>;
  avgSize: number;
  iterations: number;
  budget: number;
};

// Graph → layout: Edgar's planner over the chains (GeneratorPlanner.cs) with a total iteration
// budget. Out of budget, one retry with 4× the budget, then LayoutError.
export function layout(graph: RoomGraph, chains: Chain[], pool: ShapePool, seed: number, config: LayoutConfig): Layout {
  const neighbours = new Map<RoomId, RoomId[]>([...graph.rooms.keys()].map((id) => [id, []]));
  for (const { a, b } of graph.doors) {
    if (a === b || neighbours.get(a)!.includes(b)) continue;
    neighbours.get(a)!.push(b);
    neighbours.get(b)!.push(a);
  }
  const keys = poolKeys(graph, config);
  const shapes = new Map([...graph.rooms.keys()].map((id) => [id, pool.get(poolId(keys.get(id)!))!]));
  const distinct = new Map([...shapes.values()].flat().map((s) => [s.id, s]));
  const avgSize =
    [...distinct.values()].reduce((t, s) => {
      const b = bbox(s.outline);
      return t + (b.x1 - b.x0 + b.y1 - b.y0) / 2;
    }, 0) / distinct.size;
  const space = configSpaces(config);

  let stuck = 0;
  for (const [budget, stream] of [[config.maxTotalIterations, "layout"], [4 * config.maxTotalIterations, "layout/retry"]] as const) {
    const ctx: Context = {
      adjacent: (a, b) => neighbours.get(a)!.includes(b),
      space,
      sigma: 10 * avgSize,
      config,
      r: rng(seed, stream),
      neighbours,
      shapes,
      avgSize,
      iterations: 0,
      budget,
    };
    const result = plan(ctx, chains);
    if (!(result instanceof Map)) {
      stuck = Math.max(stuck, result.stuck);
      continue;
    }
    return {
      placements: [...graph.rooms.keys()].map((room) => ({ room, shape: result.get(room)!.shape, at: result.get(room)!.at })),
      doors: graph.doors.map((door) => ({ door, segment: placedDoor(ctx, result, door) })),
    };
  }
  throw new LayoutError(stuck, chains[stuck]!.rooms.map((id) => graph.rooms.get(id)!.number));
}

function placedDoor(ctx: Context, state: LayoutState, door: Door): Segment {
  const [a, b] = [state.get(door.a)!, state.get(door.b)!];
  const s = doorAt(ctx.space(a.shape, b.shape), { x: a.at.x - b.at.x, y: a.at.y - b.at.y });
  if (!s) throw new Error(`Rooms ${door.a} and ${door.b} share no door in a valid layout`);
  return { from: { x: s.from.x + b.at.x, y: s.from.y + b.at.y }, to: { x: s.to.x + b.at.x, y: s.to.y + b.at.y } };
}

type Node = { depth: number; layouts: Iterator<LayoutState>; finished: boolean };

// Search tree over chains. Each node yields layouts of its chain lazily; the deepest unfinished
// node is expanded next, so a node with no layouts left falls back to a shallower one.
function plan(ctx: Context, chains: Chain[]): LayoutState | { stuck: number } {
  if (chains.length === 0) return new Map();
  const rows: Node[][] = [];
  const add = (state: LayoutState, depth: number): Node => {
    const node = { depth, layouts: evolve(ctx, state, chains[depth]!), finished: false };
    (rows[depth] ??= []).push(node);
    return node;
  };
  add(new Map(), 0);
  while (ctx.iterations < ctx.budget) {
    let node: Node | undefined;
    for (let d = rows.length - 1; d >= 0 && !node; d--) node = rows[d]!.find((n) => !n.finished);
    node ??= add(new Map(), 0);
    const next = node.layouts.next();
    if (next.done) {
      node.finished = true;
      continue;
    }
    if (node.depth + 1 === chains.length) return next.value;
    add(next.value, node.depth + 1);
  }
  return { stuck: rows.length - 1 };
}

// Layouts of the state plus one chain (SimulatedAnnealingEvolver.cs). Trees: greedy only, two
// tries. Cycles: greedy start, then simulated annealing.
function* evolve(ctx: Context, initial: LayoutState, chain: Chain): Generator<LayoutState> {
  const { config, r } = ctx;
  if (!chain.fromFace) {
    for (let i = 0; i < 2 && ctx.iterations < ctx.budget; i++) {
      const s = addChain(ctx, initial, chain.rooms);
      if (isValid(s)) yield s;
    }
    return;
  }

  const t0 = -1 / Math.log(0.2);
  const t1 = -1 / Math.log(0.01);
  const ratio = (t1 / t0) ** (1 / (config.cycles - 1));
  let t = t0;
  let deltaAvg = 0;
  let accepted = 1;
  let failures = 0;
  let iterations = 0;
  let lastSuccess = 0;
  let current = addChain(ctx, initial, chain.rooms);
  let currentEnergy = energy(current, ctx.sigma);
  const found: LayoutState[] = [];

  for (let i = 0; i < config.cycles; i++) {
    if (shouldRestart(failures, r)) return;
    if (iterations - lastSuccess > config.maxIterationsWithoutSuccess) return;
    let success = false;
    for (let j = 0; j < config.trialsPerCycle; j++) {
      if (ctx.iterations >= ctx.budget) return;
      iterations++;
      ctx.iterations++;
      const next = perturb(ctx, current, chain.rooms);
      const nextEnergy = energy(next, ctx.sigma);
      const delta = nextEnergy - currentEnergy;

      if (isValid(next) && found.every((f) => differentEnough(ctx, next, f, chain.rooms))) {
        found.push(next);
        success = true;
        lastSuccess = iterations;
        yield next;
        if (found.length >= config.maxBranching) return;
      }

      if (delta > 0 && i === 0 && j === 0) deltaAvg = 15 * delta;
      if (delta <= 0 || r() < Math.exp(-delta / (deltaAvg * t))) {
        accepted++;
        current = next;
        currentEnergy = nextEnergy;
        deltaAvg = (deltaAvg * (accepted - 1) + Math.abs(delta)) / accepted;
      }
    }
    if (!success) failures++;
    t *= ratio;
  }
}

// Edgar's random restarts: the more cycles without a new layout, the likelier.
function shouldRestart(failures: number, r: Rng): boolean {
  const steps: [number, number][] = [[8, 2], [6, 3], [4, 5], [2, 7]];
  return steps.some(([after, odds]) => failures > after && Math.floor(r() * odds) === 0);
}

function addChain(ctx: Context, state: LayoutState, rooms: RoomId[]): LayoutState {
  return rooms.reduce((s, room) => addGreedily(ctx, s, room), state);
}

// LayoutOperations.AddNodeGreedily: every shape, every segment of its maximum intersection with
// the placed neighbours, a sample of points on each; lowest energy of the room wins. The very
// first room goes at (0, 0).
function addGreedily(ctx: Context, state: LayoutState, room: RoomId): LayoutState {
  const placed = ctx.neighbours.get(room)!.filter((n) => state.has(n));
  const shapes = shuffle([...ctx.shapes.get(room)!], ctx.r);
  if (placed.length === 0) {
    ctx.iterations++;
    return place(ctx, state, room, shapes[0]!, { x: 0, y: 0 });
  }

  let best: { energy: number; shape: Shape; at: Point } | null = null;
  search: for (const shape of shapes) {
    const { offsets, satisfied } = intersection(ctx, state, shape, placed);
    if (satisfied === 0) continue;
    for (const line of shuffle([...offsets], ctx.r)) {
      for (const at of samples(line, ctx.config.greedyMaxPoints, ctx.r)) {
        ctx.iterations++;
        const e = roomEnergy(terms(ctx, state, room, { shape, at }), ctx.sigma);
        if (!best || e < best.energy) best = { energy: e, shape, at };
        if (best.energy <= 0) break search;
      }
    }
  }
  if (!best) throw new Error(`Room ${room}: no shape can connect to its neighbours`);
  return place(ctx, state, room, best.shape, best.at);
}

const intersection = (ctx: Context, state: LayoutState, shape: Shape, placed: RoomId[]) =>
  maximumIntersection(
    placed.map((n) => ({ space: ctx.space(shape, state.get(n)!.shape), at: state.get(n)!.at })),
    ctx.r,
  );

// All points of the segment, shuffled; long segments give max evenly spaced points, ends included.
function samples(s: Segment, max: number, r: Rng): Point[] {
  const axis = s.from.y === s.to.y ? "x" : "y";
  const count = s.to[axis] - s.from[axis] + 1;
  if (count <= max) return shuffle(Array.from({ length: count }, (_, i) => ({ ...s.from, [axis]: s.from[axis] + i })), r);
  return Array.from({ length: max }, (_, i) => ({ ...s.from, [axis]: s.from[axis] + Math.round((i * (count - 1)) / (max - 1)) }));
}

// LayoutOperations.PerturbLayout: change the shape of a random chain room, or move one to a random
// point of its maximum intersection (segments weighted by length). A room that satisfies no
// neighbour changes shape instead.
function perturb(ctx: Context, state: LayoutState, rooms: RoomId[]): LayoutState {
  const { r } = ctx;
  const reshape = r() < ctx.config.shapePerturbChance;
  const room = rooms[Math.floor(r() * rooms.length)]!;
  const c = state.get(room)!;
  const randomShape = () => {
    const shapes = ctx.shapes.get(room)!;
    return place(ctx, state, room, shapes[Math.floor(r() * shapes.length)]!, c.at);
  };
  if (reshape) return randomShape();

  const placed = ctx.neighbours.get(room)!.filter((n) => state.has(n));
  const { offsets, satisfied } = intersection(ctx, state, c.shape, placed);
  if (satisfied === 0) return randomShape();
  const length = (s: Segment) => s.to.x - s.from.x + s.to.y - s.from.y + 1;
  let pick = r() * offsets.reduce((t, s) => t + length(s), 0);
  const line = offsets.find((s) => (pick -= length(s)) < 0) ?? offsets.at(-1)!;
  const axis = line.from.y === line.to.y ? "x" : "y";
  const at = { ...line.from, [axis]: line.from[axis] + Math.floor(r() * length(line)) };
  return place(ctx, state, room, c.shape, at);
}

// AbstractLayoutOperations.AreDifferentEnough, averaged over the chain's rooms.
function differentEnough(ctx: Context, a: LayoutState, b: LayoutState, rooms: RoomId[]): boolean {
  const diff =
    rooms.reduce((t, room) => {
      const [ca, cb] = [a.get(room)!, b.get(room)!];
      const [pa, pb] = [centre(ca), centre(cb)];
      const d = (5 * (Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y))) / ctx.avgSize;
      return t + d ** 2 * (ca.shape.id === cb.shape.id ? 1 : 4);
    }, 0) / rooms.length;
  return ctx.config.differenceScale * diff >= 1;
}
