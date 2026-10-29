import { partition, type Point, type Polygon, type Segment } from "../engine/geometry";
import { randInt, rng, type Rng } from "../engine/rng";

// Dyson rock hatching (docs/dyson-style.md, hatching): clusters of short parallel strokes in a
// ragged band outside the floors. Grid units throughout.
export const hatchDepth = 1.5;
const radius = 0.3; // Poisson-disc spacing of the clusters
const ragged = 0.6; // past this share of the depth clusters thin out, linearly to none
const spacing = 0.12; // between the strokes of a cluster
const length = 0.45; // of a stroke, ± 20% per cluster
const tries = 30; // Bridson's k
const reach = Math.ceil(hatchDepth); // cells to search around a point
// Farthest a stroke end gets from a floor: depth, half the longest stroke, the outer stroke's offset.
export const hatchReach = hatchDepth + (length * 1.2) / 2 + 1.5 * spacing;

export type Cluster = { centre: Point; strokes: Segment[] };
// Unit cells on a dense grid over the floors' bounding box grown by reach + 1, so every cell a
// search touches is inside it: 1 floor, 2 rock to hatch (within reach of a floor), 0 other rock.
export type Cells = { x0: number; y0: number; w: number; h: number; cell: Uint8Array };

const at = (c: Cells, x: number, y: number) => (x < c.x0 || y < c.y0 || x >= c.x0 + c.w || y >= c.y0 + c.h ? 0 : c.cell[(y - c.y0) * c.w + x - c.x0]);
export const isFloor = (c: Cells, x: number, y: number) => at(c, x, y) === 1;

export function floorCells(floors: Polygon[]): Cells {
  const rects = floors.flatMap((f) => partition(f));
  const x0 = Math.min(...rects.map((r) => r.x0)) - reach - 1;
  const y0 = Math.min(...rects.map((r) => r.y0)) - reach - 1;
  const w = Math.max(...rects.map((r) => r.x1)) + reach + 1 - x0;
  const h = Math.max(...rects.map((r) => r.y1)) + reach + 1 - y0;
  const cell = new Uint8Array(w * h);
  for (const r of rects) for (let y = r.y0; y < r.y1; y++) cell.fill(1, (y - y0) * w + r.x0 - x0, (y - y0) * w + r.x1 - x0);
  for (let y = reach; y < h - reach; y++) {
    for (let x = reach; x < w - reach; x++) {
      if (cell[y * w + x] !== 1) continue;
      for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) if (cell[(y + dy) * w + x + dx] === 0) cell[(y + dy) * w + x + dx] = 2;
    }
  }
  return { x0, y0, w, h, cell };
}

// Distance from p to the nearest floor cell; Infinity past hatchDepth.
export function distance(p: Point, c: Cells): number {
  const [cx, cy] = [Math.floor(p.x), Math.floor(p.y)];
  let best = Infinity;
  for (let x = cx - reach; x <= cx + reach; x++) {
    for (let y = cy - reach; y <= cy + reach; y++) {
      if (isFloor(c, x, y)) best = Math.min(best, Math.hypot(Math.max(x - p.x, 0, p.x - x - 1), Math.max(y - p.y, 0, p.y - y - 1)));
    }
  }
  return best <= hatchDepth ? best : Infinity;
}

// Bridson's Poisson disc over the rock cells to hatch, restarted in every cell it has not
// reached, so rock enclosed by a ring of rooms gets hatched too.
function poisson(c: Cells, r: Rng): Point[] {
  const size = radius / Math.SQRT2;
  const [gw, gh] = [Math.ceil(c.w / size), Math.ceil(c.h / size)];
  const grid = new Int32Array(gw * gh).fill(-1); // index into points
  const slot = (p: Point) => Math.floor((p.y - c.y0) / size) * gw + Math.floor((p.x - c.x0) / size);
  const points: Point[] = [];
  const free = (p: Point) => {
    const [x, y] = [Math.floor(p.x), Math.floor(p.y)];
    if (at(c, x, y) !== 2) return false;
    const [gx, gy] = [Math.floor((p.x - c.x0) / size), Math.floor((p.y - c.y0) / size)];
    for (let j = Math.max(gy - 2, 0); j <= Math.min(gy + 2, gh - 1); j++) {
      for (let i = Math.max(gx - 2, 0); i <= Math.min(gx + 2, gw - 1); i++) {
        const k = grid[j * gw + i]!;
        if (k >= 0 && Math.hypot(points[k]!.x - p.x, points[k]!.y - p.y) < radius) return false;
      }
    }
    return true;
  };
  const active: Point[] = [];
  const add = (p: Point) => {
    grid[slot(p)] = points.length;
    points.push(p);
    active.push(p);
  };
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (c.cell[y * c.w + x] !== 2) continue;
      const p = { x: c.x0 + x + r(), y: c.y0 + y + r() };
      if (!free(p)) continue;
      add(p);
      while (active.length) {
        const i = Math.floor(r() * active.length);
        const a = active[i]!;
        let found = false;
        for (let t = 0; t < tries && !found; t++) {
          const angle = r() * 2 * Math.PI;
          const d = radius * (1 + r());
          const q = { x: a.x + d * Math.cos(angle), y: a.y + d * Math.sin(angle) };
          if (free(q)) {
            add(q);
            found = true;
          }
        }
        if (!found) {
          active[i] = active[active.length - 1]!;
          active.pop();
        }
      }
    }
  }
  return points;
}

// Hatch clusters around the floors (rooms and corridors), stream render/hatch of the layout seed.
// Strokes may poke into a floor: the floors paint over them.
export function hatch(floors: Polygon[], layoutSeed: number): Cluster[] {
  const cells = floorCells(floors);
  const r = rng(layoutSeed, "render/hatch");
  return poisson(cells, r).flatMap((centre): Cluster[] => {
    const d = distance(centre, cells);
    if (d === 0 || d === Infinity) return [];
    if (d > ragged * hatchDepth && r() > (hatchDepth - d) / ((1 - ragged) * hatchDepth)) return [];
    const angle = r() * Math.PI;
    const [ux, uy] = [Math.cos(angle), Math.sin(angle)];
    const k = randInt(r, 2, 4);
    const half = (length * (0.8 + 0.4 * r())) / 2;
    const strokes = Array.from({ length: k }, (_, i): Segment => {
      const o = (i - (k - 1) / 2) * spacing;
      const c = { x: centre.x - uy * o, y: centre.y + ux * o };
      return { from: { x: c.x - ux * half, y: c.y - uy * half }, to: { x: c.x + ux * half, y: c.y + uy * half } };
    });
    return [{ centre, strokes }];
  });
}

// Hand-inked walls (docs/dyson-style.md, wobble): every edge cut every wobbleStep in absolute grid
// coordinates, each cut moved up to amplitude across its edge by a hash of the point and the layout seed, signed in
// absolute axes, so two rooms walking a shared wall either way draw it once. Whole-unit points stay:
// corners, and a neighbour's corner in the middle of an edge (T-junction).
// Grid units between cuts; 0.25 read saw-toothed at 1×. Its inverse must be an integer: keys are
// whole cut counts, so no float formatting in the hash.
export const wobbleStep = 0.5;
const cuts = 1 / wobbleStep;

export function wobble(outline: Polygon, layoutSeed: number, amplitude: number): Polygon {
  if (amplitude === 0) return outline;
  return outline.flatMap((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const [ax, ay, bx, by] = [a.x, a.y, b.x, b.y].map((v) => v * cuts) as [number, number, number, number];
    if (![ax, ay, bx, by].every(Number.isInteger) || (ax !== bx && ay !== by)) throw new Error(`wobble: edge (${a.x},${a.y})–(${b.x},${b.y}) not axis-parallel on the ${wobbleStep} grid`);
    const n = Math.abs(bx - ax) + Math.abs(by - ay); // axis-parallel: one of them is 0
    const [dx, dy] = [Math.sign(bx - ax), Math.sign(by - ay)];
    return Array.from({ length: n }, (_, k): Point => {
      const [qx, qy] = [ax + k * dx, ay + k * dy];
      if (qx % cuts === 0 && qy % cuts === 0) return { x: qx / cuts, y: qy / cuts };
      const o = amplitude * (2 * rng(layoutSeed, `render/wobble/${qx},${qy}`)() - 1);
      return dy === 0 ? { x: qx / cuts, y: qy / cuts + o } : { x: qx / cuts + o, y: qy / cuts };
    });
  });
}
