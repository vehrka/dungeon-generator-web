import { describe, expect, it } from "vitest";
import { configSpaces } from "../src/engine/configSpace";
import { defaultConfig } from "../src/engine/config";
import { energy, isValid, pairTerms, place, roomEnergy, type EnergyContext, type LayoutState } from "../src/engine/energy";
import { overlapArea, polygon, rectangle, translate, type Point } from "../src/engine/geometry";
import { randInt, rng } from "../src/engine/rng";
import type { Shape } from "../src/engine/shapes";

const p = (x: number, y: number): Point => ({ x, y });
const shape = (w: number, h: number): Shape => ({ id: `rect-${w}x${h}`, outline: rectangle(w, h) });
const sq = shape(3, 3);
const big = shape(5, 4);

// Rooms 0–1–2 in a path; 0 and 2 are not neighbours.
const doors = new Set(["0|1", "1|0", "1|2", "2|1"]);
const ctx: EnergyContext = {
  adjacent: (a, b) => doors.has(`${a}|${b}`),
  space: configSpaces(defaultConfig),
  sigma: 10 * 3,
};

const build = (rooms: [number, Shape, Point][]): LayoutState =>
  rooms.reduce((s, [id, sh, at]) => place(ctx, s, id, sh, at), new Map() as LayoutState);

describe("energy", () => {
  it("is zero for neighbours at a valid offset", () => {
    const s = build([[0, sq, p(0, 0)], [1, sq, p(3, 0)]]);
    expect(isValid(s)).toBe(true);
    expect(energy(s, ctx.sigma)).toBe(0);
  });

  it("counts overlap on both rooms and no distance while they overlap", () => {
    const s = build([[0, sq, p(0, 0)], [1, sq, p(1, 1)]]);
    expect(s.get(0)).toMatchObject({ overlap: 4, distance: 0 });
    expect(s.get(1)).toMatchObject({ overlap: 4, distance: 0 });
    expect(isValid(s)).toBe(false);
    expect(energy(s, ctx.sigma)).toBeCloseTo(2 * (Math.exp(4 / (30 * 625)) - 1));
  });

  it("adds the centre distance of neighbours that do not share a door", () => {
    const s = build([[0, sq, p(0, 0)], [1, sq, p(10, 4)]]);
    expect(s.get(0)).toMatchObject({ overlap: 0, distance: 14 });
    expect(isValid(s)).toBe(false);
    expect(energy(s, ctx.sigma)).toBeCloseTo(2 * (Math.exp(14 / (30 * 50)) - 1));
  });

  it("ignores far apart rooms that are not neighbours", () => {
    const s = build([[0, sq, p(0, 0)], [2, sq, p(20, 20)]]);
    expect(isValid(s)).toBe(true);
  });

  it("does not count touching corners as a door", () => {
    expect(pairTerms(ctx, 0, { shape: sq, at: p(0, 0) }, 1, { shape: sq, at: p(3, 3) }).distance).toBeGreaterThan(0);
  });

  it("measures overlap as geometry.overlapArea does", () => {
    const L = polygon([p(0, 0), p(3, 0), p(3, 4), p(7, 4), p(7, 7), p(0, 7)]);
    const shapes = [sq, big, { id: "L", outline: L }];
    const r = rng(9);
    for (let i = 0; i < 500; i++) {
      const [a, b] = [shapes[randInt(r, 0, 2)]!, shapes[randInt(r, 0, 2)]!];
      const [pa, pb] = [p(randInt(r, -8, 8), randInt(r, -8, 8)), p(randInt(r, -8, 8), randInt(r, -8, 8))];
      const expected = overlapArea(translate(a.outline, pa), translate(b.outline, pb));
      expect(pairTerms(ctx, 0, { shape: a, at: pa }, 2, { shape: b, at: pb }).overlap).toBe(expected);
    }
  });

  it("raises with overlap and distance", () => {
    expect(roomEnergy({ overlap: 0, distance: 0 }, 30)).toBe(0);
    expect(roomEnergy({ overlap: 5, distance: 0 }, 30)).toBeGreaterThan(roomEnergy({ overlap: 2, distance: 0 }, 30));
    expect(roomEnergy({ overlap: 0, distance: 9 }, 30)).toBeGreaterThan(roomEnergy({ overlap: 0, distance: 3 }, 30));
  });

  it("keeps the terms of every room equal to a full recomputation after many moves", () => {
    const r = rng(3);
    const shapes = [sq, big];
    let s: LayoutState = new Map();
    for (let i = 0; i < 300; i++) {
      s = place(ctx, s, randInt(r, 0, 2), shapes[randInt(r, 0, 1)]!, p(randInt(r, -6, 6), randInt(r, -6, 6)));
      for (const [id, a] of s) {
        const terms = [...s].filter(([j]) => j !== id).map(([j, b]) => pairTerms(ctx, id, a, j, b));
        expect(a.overlap).toBe(terms.reduce((t, x) => t + x.overlap, 0));
        expect(a.distance).toBe(terms.reduce((t, x) => t + x.distance, 0));
      }
    }
  });
});
