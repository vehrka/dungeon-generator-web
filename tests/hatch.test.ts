import { describe, expect, it } from "vitest";
import { rectangle, translate } from "../src/engine/geometry";
import { distance, floorCells, hatch, hatchDepth, hatchReach, isFloor } from "../src/render/hatch";

// Two rooms joined by a one-cell corridor, an L-shaped gap between them.
const floors = [rectangle(4, 3), translate(rectangle(1, 2), { x: 4, y: 1 }), translate(rectangle(3, 5), { x: 5, y: 0 })];
const cells = floorCells(floors);

describe("floorCells", () => {
  it("holds every unit cell of the floors once", () => {
    expect(cells.cell.filter((v) => v === 1).length).toBe(12 + 2 + 15);
    expect(isFloor(cells, 0, 0) && isFloor(cells, 4, 1) && isFloor(cells, 4, 2) && isFloor(cells, 7, 4)).toBe(true);
    expect(isFloor(cells, 4, 0) || isFloor(cells, 8, 0) || isFloor(cells, -1, 0)).toBe(false);
  });
});

describe("distance", () => {
  it("is 0 on the floor and the distance to the nearest floor cell outside", () => {
    expect(distance({ x: 1.5, y: 1.5 }, cells)).toBe(0);
    expect(distance({ x: -0.5, y: 1 }, cells)).toBeCloseTo(0.5);
    expect(distance({ x: 4.5, y: 0.5 }, cells)).toBeCloseTo(0.5); // above the corridor, between both rooms
    expect(distance({ x: -1, y: -1 }, cells)).toBeCloseTo(Math.SQRT2);
  });

  it("is infinite past the hatch depth", () => {
    expect(distance({ x: -hatchDepth - 0.1, y: 1 }, cells)).toBe(Infinity);
    expect(distance({ x: 11.5, y: 0.5 }, cells)).toBe(Infinity); // past the grid, no wrap into the next row
  });
});

describe("hatch", () => {
  const clusters = hatch(floors, 7);

  it("puts every cluster in the rock band around the floors", () => {
    expect(clusters.length).toBeGreaterThan(50);
    for (const { centre } of clusters) {
      const d = distance(centre, cells);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(hatchDepth);
    }
  });

  it("hatches all round, the gap between the rooms too", () => {
    const near = (x: number, y: number) => clusters.some(({ centre: c }) => Math.hypot(c.x - x, c.y - y) < 0.6);
    for (const [x, y] of [[-0.5, 1.5], [2, -0.5], [2, 3.5], [8.5, 2.5], [4.5, 0.5], [4.5, 3.5]] as const) expect(near(x, y)).toBe(true);
  });

  it("keeps every stroke within hatchReach of the floors", () => {
    // to the floors' rectangles directly: distance() stops at hatchDepth
    const rects = [[0, 0, 4, 3], [4, 1, 5, 3], [5, 0, 8, 5]] as const;
    const far = (p: { x: number; y: number }) => Math.min(...rects.map(([x0, y0, x1, y1]) => Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(y0 - p.y, 0, p.y - y1))));
    for (const { strokes } of clusters) for (const { from, to } of strokes) for (const p of [from, to]) expect(far(p)).toBeLessThanOrEqual(hatchReach);
  });

  it("draws 2 to 4 parallel strokes per cluster", () => {
    for (const { strokes } of clusters) {
      expect(strokes.length).toBeGreaterThanOrEqual(2);
      expect(strokes.length).toBeLessThanOrEqual(4);
      const dir = strokes.map((s) => Math.atan2(s.to.y - s.from.y, s.to.x - s.from.x));
      for (const a of dir) expect(a).toBeCloseTo(dir[0]!);
    }
  });

  it("keeps the samples apart", () => {
    const cs = clusters.map((c) => c.centre);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) expect(Math.hypot(cs[i]!.x - cs[j]!.x, cs[i]!.y - cs[j]!.y)).toBeGreaterThan(0.29);
  });

  it("is deterministic per layout seed", () => {
    expect(hatch(floors, 7)).toEqual(clusters);
    expect(hatch(floors, 8)).not.toEqual(clusters);
  });
});
