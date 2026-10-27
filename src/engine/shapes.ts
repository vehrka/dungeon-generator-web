import type { LayoutConfig } from "./config";
import { doorLines, type DoorLine } from "./doors";
import { polygon, rectangle, rotate, type Point, type Polygon } from "./geometry";
import { randInt, rng } from "./rng";
import { sizeRule } from "./shapeRules";
import type { RoomGraph, RoomId } from "./types";

// Shapes with the same outline and doors share an id, so configuration spaces are cached once per
// shape. Without doorLines, every wall takes doors (doors.ts).
export type Shape = { id: string; outline: Polygon; doorLines?: DoorLine[] };
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
const stream = (family: string, { type, extra }: PoolKey) => (extra > 0 ? `${family}+${extra}/${type}` : `${family}/${type}`);

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
  return new Map([...unique].map(([id, key]) => [id, [...rectangles(key, seed, config), ...polyominoes(key, seed, config)]]));
}

function rectangles(key: PoolKey, seed: number, config: LayoutConfig): Shape[] {
  const count = config.shapesPerType;
  const { min, max } = sizeRule(key.type, key.extra, config.hubGrowth);
  const r = rng(seed, stream("rect", key));
  const possible = (max - min + 1) ** 2;
  const shapes = new Map<string, Shape>();
  while (shapes.size < Math.min(count, possible)) {
    const [w, h] = [randInt(r, min, max), randInt(r, min, max)];
    const id = `rect-${w}x${h}`;
    if (!shapes.has(id)) shapes.set(id, { id, outline: rectangle(w, h) });
  }
  return [...shapes.values()];
}

// Box w×h, arms a wide (vertical) and b high (horizontal); every notch at least n deep and wide.
type Family = {
  name: string;
  count: (config: LayoutConfig) => number;
  fits: (w: number, h: number, a: number, b: number, n: number) => boolean;
  outline: (w: number, h: number, a: number, b: number) => Point[];
};

const families: Family[] = [
  {
    // corner top-left: bar along the top, arm down the left
    name: "l",
    count: (c) => c.lShapes,
    fits: (w, h, a, b, n) => w - a >= n && h - b >= n,
    outline: (w, h, a, b) => [p(0, 0), p(w, 0), p(w, b), p(a, b), p(a, h), p(0, h)],
  },
  {
    // bar along the top, stem centred below it (odd margin: extra cell right)
    name: "t",
    count: (c) => c.tShapes,
    fits: (w, h, a, b, n) => Math.floor((w - a) / 2) >= n && h - b >= n,
    outline: (w, h, a, b) => {
      const l = Math.floor((w - a) / 2);
      return [p(0, 0), p(w, 0), p(w, b), p(l + a, b), p(l + a, h), p(l, h), p(l, b), p(0, b)];
    },
  },
  {
    name: "plus",
    count: (c) => c.plusShapes,
    fits: (w, h, a, b, n) => Math.floor((w - a) / 2) >= n && Math.floor((h - b) / 2) >= n,
    outline: (w, h, a, b) => {
      const [l, t] = [Math.floor((w - a) / 2), Math.floor((h - b) / 2)];
      const [r, d] = [l + a, t + b];
      return [p(l, 0), p(r, 0), p(r, t), p(w, t), p(w, d), p(r, d), p(r, h), p(l, h), p(l, d), p(0, d), p(0, t), p(l, t)];
    },
  },
];

const p = (x: number, y: number): Point => ({ x, y });

// Our stand-in for Edgar's hand-made L/T templates (Resources/Rooms/otherShapes.yml): per family,
// lShapes/tShapes/plusShapes distinct bases drawn from every box and arm pair the size rule allows,
// each with all its distinct rotations, as Edgar's default transformations
// (ConfigurationSpacesGenerator.cs:379). A plus can be a turned plus of another box: such a draw
// is dropped and does not count.
function polyominoes(key: PoolKey, seed: number, config: LayoutConfig): Shape[] {
  if (config.minArm < 1 || config.minNotch < 1) throw new Error(`minArm and minNotch must be at least 1, got ${config.minArm} and ${config.minNotch}`);
  const { min, max } = sizeRule(key.type, key.extra, config.hubGrowth);
  const seen = new Set<string>();
  const shapes: Shape[] = [];
  for (const family of families) {
    if (family.count(config) === 0) continue;
    const options: [number, number, number, number][] = [];
    for (let w = min; w <= max; w++)
      for (let h = min; h <= max; h++)
        for (let a = config.minArm; a < w; a++) for (let b = config.minArm; b < h; b++) if (family.fits(w, h, a, b, config.minNotch)) options.push([w, h, a, b]);
    const r = rng(seed, stream(family.name, key));
    for (let drawn = 0; drawn < family.count(config) && options.length > 0; ) {
      const [w, h, a, b] = options.splice(randInt(r, 0, options.length - 1), 1)[0]!;
      const base = polygon(family.outline(w, h, a, b));
      if (seen.has(JSON.stringify(base))) continue;
      drawn++;
      for (let q = 0; q < 4; q++) {
        const outline = rotate(base, q);
        const k = JSON.stringify(outline);
        if (seen.has(k)) continue;
        seen.add(k);
        shapes.push({ id: `${family.name}-${w}x${h}-${a}x${b}-r${q}`, outline });
      }
    }
  }
  return shapes;
}

// Straight corridors, doorLength wide, one per length and orientation, doors only on the two ends
// (Edgar's SpecificPositionsMode in Resources/Rooms/corridors.yml).
export function corridorShapes(config: LayoutConfig): Shape[] {
  const w = config.doorLength;
  return config.corridorLengths.flatMap((length) =>
    (["v", "h"] as const).map((o) => {
      const outline = o === "v" ? rectangle(w, length) : rectangle(length, w);
      // cornerDistance 0: an end is exactly one door wide, any other value would leave it none
      const ends = doorLines(outline, { doorLength: w, cornerDistance: 0 }).filter((d) => (o === "v" ? d.normal.x === 0 : d.normal.y === 0));
      return { id: `corridor-${o}${length}`, outline, doorLines: ends };
    }),
  );
}
