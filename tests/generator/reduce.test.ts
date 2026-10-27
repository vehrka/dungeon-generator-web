import { describe, expect, it } from "vitest";
import { reduce } from "../../src/engine/generator/reduce";
import type { DGraph } from "../../src/engine/generator/types";
import { build, GOAL, LOCK, PICKUP, room, START } from "./build";

const types = (g: DGraph) => g.vertices().map(([, v]) => v.type);
const edges = (g: DGraph) => g.edges().map((e) => [e.source, e.target, e.attrs.oneway]);

describe("reduce", () => {
  it("merges rooms of the same type keeping their exits", () => {
    const [t, c] = [room("t"), room("c")];
    const g = build([START, GOAL, t, t, c, c, room("n")], [[0, 2], [2, 3], [3, 4], [4, 5], [5, 1], [3, 6]]);
    reduce(g);
    expect(types(g)).toEqual(["st", "gl", "t", "c", "n"]);
    expect(edges(g).map(([s, d]) => [s, d]).sort()).toEqual([[0, 2], [2, 4], [2, 6], [4, 1]]);
  });

  it("rooms joined one-way do not merge", () => {
    const e = room("e");
    const g = build([START, GOAL, e, e], [[0, 2], [2, 3, true], [3, 1]]);
    reduce(g);
    expect(g.vertexCount).toBe(4);
    expect(edges(g).map(([, , o]) => o)).toEqual([false, true, false]);
  });

  it("merge keeps one-way exits", () => {
    const [p, e] = [room("p"), room("e")];
    const g = build([START, GOAL, p, p, e], [[0, 2], [2, 3], [3, 4, true], [4, 2, true], [3, 1]]);
    reduce(g);
    expect(new Set(edges(g).map((x) => x.join()))).toEqual(new Set(["0,2,false", "2,4,true", "4,2,true", "2,1,false"]));
  });

  it("rooms holding objects do not merge", () => {
    const key = { ...PICKUP, type: "n" };
    const g = build([START, GOAL, room("n"), key], [[0, 2], [2, 3], [2, 1]]);
    reduce(g);
    expect(g.vertexCount).toBe(4);
  });

  it("rooms on both sides of one gate do not merge", () => {
    const c = room("c");
    const gate = { ...LOCK, type: "gate", gate: "state" as const };
    // 2 – gate – 3 and 2 – 4 – 5 – 3: merging the whole loop would put the gate inside one room
    const g = build([START, GOAL, c, c, c, c, gate, PICKUP], [[0, 7], [0, 2], [2, 6], [6, 3], [2, 4], [4, 5], [5, 3], [3, 1]]);
    reduce(g);
    const ends = g.incident(6).map((e) => (e.source === 6 ? e.target : e.source));
    expect(new Set(ends).size).toBe(2);
    expect(types(g).filter((t) => t === "c")).toHaveLength(2);
  });

  it("asserts no gate chain", () => {
    const g = build([START, GOAL, LOCK, { ...LOCK }], [[0, 2], [2, 3], [3, 1]]);
    expect(() => reduce(g)).toThrow("Gate chain: gates 2 and 3 are joined");
  });
});
