import type { LayoutConfig } from "./config";
import { rectangle, type Polygon } from "./geometry";
import { randInt, rng } from "./rng";
import { sizeRule } from "./shapeRules";
import type { RoomGraph, RoomId } from "./types";

// Shapes with the same outline share an id, so configuration spaces are cached once per outline.
export type Shape = { id: string; outline: Polygon };
export type ShapePool = Map<string, Shape[]>; // poolId → shapes

// A room's pool: its type and its neighbours above hubDegree, so hubs get walls long enough for all
// of them. Kept as fields: types are free text ("gb: <reward>"), a suffix could not be parsed back.
export type PoolKey = { type: string; extra: number };

export const poolKey = (type: string, degree: number, config: Pick<LayoutConfig, "hubDegree">): PoolKey => ({
  type,
  extra: Math.max(0, degree - config.hubDegree),
});

// Unique per key: extra has no "/". Rooms up to hubDegree keep the type's stream, so their shapes.
export const poolId = ({ type, extra }: PoolKey) => `${extra}/${type}`;
const stream = ({ type, extra }: PoolKey) => (extra > 0 ? `rect+${extra}/${type}` : `rect/${type}`);

// Degree is distinct neighbours, as layout counts them: self-loops and parallel doors add nothing.
export function poolKeys(graph: RoomGraph, config: Pick<LayoutConfig, "hubDegree">): Map<RoomId, PoolKey> {
  const neighbours = new Map<RoomId, Set<RoomId>>([...graph.rooms.keys()].map((id) => [id, new Set()]));
  for (const { a, b } of graph.doors) {
    if (a === b) continue;
    neighbours.get(a)!.add(b);
    neighbours.get(b)!.add(a);
  }
  return new Map([...graph.rooms.values()].map((room) => [room.id, poolKey(room.type, neighbours.get(room.id)!.size, config)]));
}

// Seeded procedural shapes per pool key. Each family draws from its own stream per key, so later
// families (L/T, caves) do not change the rectangles of a seed.
export function shapePool(keys: Iterable<PoolKey>, seed: number, config: LayoutConfig): ShapePool {
  const unique = new Map([...keys].map((key) => [poolId(key), key]));
  return new Map([...unique].map(([id, key]) => [id, rectangles(key, seed, config)]));
}

function rectangles(key: PoolKey, seed: number, config: LayoutConfig): Shape[] {
  const count = config.shapesPerType;
  const { min, max } = sizeRule(key.type, key.extra, config.hubGrowth);
  const r = rng(seed, stream(key));
  const possible = (max - min + 1) ** 2;
  const shapes = new Map<string, Shape>();
  while (shapes.size < Math.min(count, possible)) {
    const [w, h] = [randInt(r, min, max), randInt(r, min, max)];
    const id = `rect-${w}x${h}`;
    if (!shapes.has(id)) shapes.set(id, { id, outline: rectangle(w, h) });
  }
  return [...shapes.values()];
}
