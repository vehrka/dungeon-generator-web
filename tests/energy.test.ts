import { describe, expect, it } from "vitest";
import { configSpaces, type Link } from "../src/engine/configSpace";
import { defaultConfig } from "../src/engine/config";
import { energy, isValid, pairTerms, place, roomEnergy, type EnergyContext, type LayoutState } from "../src/engine/energy";
import { overlapArea, polygon, rectangle, translate, type Point } from "../src/engine/geometry";
import { randInt, rng } from "../src/engine/rng";
import { corridorShapes, type Shape } from "../src/engine/shapes";

const p = (x: number, y: number): Point => ({ x, y });
const shape = (w: number, h: number): Shape => ({ id: `rect-${w}x${h}`, outline: rectangle(w, h) });
const sq = shape(3, 3);
const big = shape(5, 4);

// Rooms 0–1–2 in a path; 0 and 2 are not neighbours. Room 3 joins 0 over a corridor; 9 is a placed
// corridor with a door to room 4.
const links = new Map<string, Link>(
  [[0, 1, "door"], [1, 2, "door"], [0, 3, "corridor"], [9, 4, "door"]].flatMap(([a, b, l]) => [[`${a}|${b}`, l as Link], [`${b}|${a}`, l as Link]]),
);
const corridors = corridorShapes({ ...defaultConfig, corridorLengths: [1, 2] });
const context = (roomsCanTouch: boolean): EnergyContext => ({
  link: (a, b) => links.get(`${a}|${b}`),
  space: configSpaces(defaultConfig, corridors),
  sigma: 10 * 3,
  corridor: (id) => id === 9,
  roomsCanTouch,
});
const ctx = context(true);
const noTouch = context(false);
const [v1] = corridors;

const build = (rooms: [number, Shape, Point][], c = ctx): LayoutState =>
  rooms.reduce((s, [id, sh, at]) => place(c, s, id, sh, at), new Map() as LayoutState);

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
    const e = (overlap: number, distance: number, touching = 0) => roomEnergy({ overlap, distance, touching }, 30);
    expect(e(0, 0)).toBe(0);
    expect(e(5, 0)).toBeGreaterThan(e(2, 0));
    expect(e(0, 9)).toBeGreaterThan(e(0, 3));
    expect(e(0, 0, 2)).toBe(2); // Edgar adds the touching count as is
  });

  it("keeps the terms of every room equal to a full recomputation after many moves", () => {
    const r = rng(3);
    const shapes = [sq, big];
    const ids = [0, 1, 2, 3, 4, 9];
    let s: LayoutState = new Map();
    for (let i = 0; i < 300; i++) {
      const id = ids[randInt(r, 0, ids.length - 1)]!;
      s = place(noTouch, s, id, id === 9 ? v1! : shapes[randInt(r, 0, 1)]!, p(randInt(r, -6, 6), randInt(r, -6, 6)));
      for (const [id, a] of s) {
        const terms = [...s].filter(([j]) => j !== id).map(([j, b]) => pairTerms(noTouch, id, a, j, b));
        expect(a.overlap).toBe(terms.reduce((t, x) => t + x.overlap, 0));
        expect(a.distance).toBe(terms.reduce((t, x) => t + x.distance, 0));
        expect(a.touching).toBe(terms.reduce((t, x) => t + x.touching, 0));
      }
    }
  });

  it("measures rooms joined by a corridor against the over-corridor space", () => {
    expect(isValid(build([[0, sq, p(0, 0)], [3, sq, p(4, 0)]]))).toBe(true); // corridor of 1
    expect(isValid(build([[0, sq, p(0, 0)], [3, sq, p(5, 1)]]))).toBe(true); // corridor of 2
    expect(build([[0, sq, p(0, 0)], [3, sq, p(3, 0)]]).get(3)!.distance).toBeGreaterThan(0); // touching is no door
    expect(build([[0, sq, p(0, 0)], [3, sq, p(9, 0)]]).get(3)!.distance).toBe(9);
  });

  it("counts overlap with a placed corridor, and a corridor's door like any other", () => {
    const s = build([[9, v1!, p(0, 0)], [2, sq, p(-2, -2)], [4, sq, p(-1, 1)]]);
    expect(s.get(2)).toMatchObject({ overlap: 1, distance: 0 });
    expect(s.get(9)).toMatchObject({ overlap: 1, distance: 0 });
    expect(s.get(4)).toMatchObject({ overlap: 0, distance: 0 });
  });

  it("counts touching non-neighbours when rooms may not touch, corners included", () => {
    const side = build([[0, sq, p(0, 0)], [2, sq, p(3, 0)]], noTouch);
    expect(side.get(0)).toMatchObject({ overlap: 0, distance: 0, touching: 1 });
    expect(isValid(side)).toBe(false);
    expect(energy(side, 30)).toBe(2);
    expect(build([[0, sq, p(0, 0)], [2, sq, p(3, 3)]], noTouch).get(2)!.touching).toBe(1);
    expect(build([[0, sq, p(0, 0)], [2, sq, p(4, 0)]], noTouch).get(2)!.touching).toBe(0);
    expect(build([[0, sq, p(0, 0)], [1, sq, p(3, 0)]], noTouch).get(1)!.touching).toBe(0); // neighbours
    expect(build([[0, sq, p(0, 0)], [3, sq, p(3, 3)]], noTouch).get(3)!.touching).toBe(1); // a corridor apart
    expect(build([[9, v1!, p(0, 0)], [2, sq, p(1, 0)]], noTouch).get(2)!.touching).toBe(0); // corridors may touch
    expect(isValid(build([[0, sq, p(0, 0)], [2, sq, p(3, 0)]]))).toBe(true);
  });
});
