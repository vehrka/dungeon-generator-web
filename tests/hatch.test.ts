import { describe, expect, it } from "vitest";
import { rectangle, translate } from "../src/engine/geometry";
import { distance, floorCells, hatch, hatchDepth, hatchReach, isFloor, wobble, wobbleStep } from "../src/render/hatch";

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

describe("wobble", () => {
  const wobbleAmp = 0.8 / 24;
  const a = rectangle(4, 3);
  const b = translate(rectangle(3, 2), { x: 4, y: 1 }); // touches a along x = 4, y 1–3; its corner (4, 1) on a's edge
  const [wa, wb] = [wobble(a, 7, wobbleAmp), wobble(b, 7, wobbleAmp)];
  const on = (w: readonly { x: number; y: number }[], x: number, y0: number, y1: number) =>
    w.filter((p) => Math.abs(p.x - x) <= wobbleAmp && p.y >= y0 && p.y <= y1).map((p) => `${p.x},${p.y}`).sort();
  const whole = (v: number) => Number.isInteger(v);

  it("draws a shared stretch with the same points from both rooms", () => {
    expect(on(wa, 4, 1, 3)).toEqual(on(wb, 4, 1, 3));
    expect(on(wa, 4, 1, 3).length).toBe(2 / wobbleStep + 1);
  });

  it("keeps every whole-unit point, so corners and T-junctions, in place", () => {
    for (const p of [...a, ...b]) expect(wa.concat(wb)).toContainEqual(p);
    expect(wa).toContainEqual({ x: 4, y: 1 });
    expect(wa.filter((p) => whole(p.x) && whole(p.y)).length).toBe(14);
  });

  it("moves every other point at most the amplitude, across its edge only", () => {
    for (const p of wa) {
      const [qx, qy] = [Math.round(p.x / wobbleStep) * wobbleStep, Math.round(p.y / wobbleStep) * wobbleStep];
      const horizontal = qy === 0 || qy === 3; // a's edges: y 0 and 3 horizontal, x 0 and 4 vertical
      if (whole(qx) && whole(qy)) expect(p).toEqual({ x: qx, y: qy });
      else if (horizontal) expect(p.x === qx && Math.abs(p.y - qy) <= wobbleAmp).toBe(true);
      else expect(p.y === qy && Math.abs(p.x - qx) <= wobbleAmp).toBe(true);
    }
    expect(wa.length).toBe(14 / wobbleStep);
  });

  it("refuses an edge off the axes or off its grid", () => {
    expect(() => wobble([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], 7, wobbleAmp)).toThrow(/not axis-parallel/);
    expect(() => wobble(translate(rectangle(2, 2), { x: 0.3, y: 0 }), 7, wobbleAmp)).toThrow(/not axis-parallel/);
  });

  it("gives the outline back at amplitude 0", () => {
    expect(wobble(a, 7, 0)).toEqual(a);
    expect(wobble(b, 7, 0)).toEqual(b);
  });

  it("is deterministic per layout seed", () => {
    expect(wobble(a, 7, wobbleAmp)).toEqual(wa);
    expect(wobble(a, 8, wobbleAmp)).not.toEqual(wa);
  });
});
