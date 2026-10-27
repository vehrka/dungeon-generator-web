import { describe, expect, it } from "vitest";
import { progress, reachable, steps, unsolvableReasons } from "../../src/engine/generator/solve";
import { build, GOAL, LOCK, PICKUP, room, START } from "./build";

describe("solve", () => {
  it("key before its lock is solvable", () => {
    const g = build([START, GOAL, LOCK, PICKUP], [[0, 3], [0, 2], [2, 1]]);
    expect(reachable(g)).toEqual(new Set([0, 1, 2, 3]));
    expect(unsolvableReasons(g)).toEqual([]);
  });

  it("key behind its lock is reported", () => {
    const g = build([START, GOAL, LOCK, PICKUP], [[0, 2], [2, 1], [2, 3]]);
    expect(reachable(g)).toEqual(new Set([0]));
    expect(unsolvableReasons(g)).toEqual(["GOAL unreachable", "Use spam key 1 needs spam key 1"]);
  });

  it("missing key is reported", () => {
    expect(unsolvableReasons(build([START, GOAL, LOCK], [[0, 2], [2, 1]]))).toEqual(["GOAL unreachable", "Use spam key 1 needs spam key 1"]);
  });

  it("one-way edge is not walked back", () => {
    const g = build([START, GOAL, room("n")], [[0, 1], [2, 0, true]]);
    expect(reachable(g)).toEqual(new Set([0, 1]));
    expect(unsolvableReasons(g)).toEqual([]);
  });

  it("off gate starts open, on gate needs its lever", () => {
    const lever = { id: "lever-1", type: "lever", name: "lever 1" };
    const gate = (g: "on" | "off") => ({ type: "gate", name: `Check lever 1 ${g.toUpperCase()}`, nt: false, objects: [lever], gate: g });
    expect(unsolvableReasons(build([START, GOAL, gate("off")], [[0, 2], [2, 1]]))).toEqual([]);
    expect(unsolvableReasons(build([START, GOAL, gate("on")], [[0, 2], [2, 1]]))).toEqual(["GOAL unreachable", "Check lever 1 ON needs lever 1"]);
  });

  it("steps count a gate as one step", () => {
    const g = build([START, GOAL, LOCK, room("n")], [[0, 3], [3, 2], [2, 1]]);
    expect(steps(g, 0, [3, 1])).toEqual([1, 2]);
  });

  it("progress runs from START (0) to the boss (1)", () => {
    const e = room("e");
    const g = build([START, GOAL, e, e, e, room("eb")], [[0, 2], [2, 3], [3, 4], [4, 5], [5, 1]]);
    expect([0, 2, 4, 5].map((v) => progress(g, v))).toEqual([0, 0.25, 0.75, 1]);
  });

});
