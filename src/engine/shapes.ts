import type { LayoutConfig } from "./config";
import { rectangle, type Polygon } from "./geometry";
import { randInt, rng } from "./rng";
import { sizeRule } from "./shapeRules";

// Shapes with the same outline share an id, so configuration spaces are cached once per outline.
export type Shape = { id: string; outline: Polygon };
export type ShapePool = Map<string, Shape[]>; // room type → shapes

// Seeded procedural shapes per room type. Each family draws from its own stream per type, so later
// families (L/T, caves) do not change the rectangles of a seed.
export function shapePool(types: string[], seed: number, config: LayoutConfig): ShapePool {
  return new Map(types.map((type) => [type, rectangles(type, seed, config.shapesPerType)]));
}

function rectangles(type: string, seed: number, count: number): Shape[] {
  const { min, max } = sizeRule(type);
  const r = rng(seed, `rect/${type}`);
  const possible = (max - min + 1) ** 2;
  const shapes = new Map<string, Shape>();
  while (shapes.size < Math.min(count, possible)) {
    const [w, h] = [randInt(r, min, max), randInt(r, min, max)];
    const id = `rect-${w}x${h}`;
    if (!shapes.has(id)) shapes.set(id, { id, outline: rectangle(w, h) });
  }
  return [...shapes.values()];
}
