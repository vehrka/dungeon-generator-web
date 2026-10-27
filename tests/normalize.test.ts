import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { normalize } from "../src/engine/normalize";
import type { DungeonJson, JsonEdge, JsonNode } from "../src/engine/types";

const room = (id: number): JsonNode => ({
  id,
  kind: "room",
  type: "n",
  objects: [],
  number: id + 1,
  label: `Room ${id}`,
});

const gate = (id: number, requires: string[] = ["k"]): JsonNode => ({
  id,
  kind: "gate",
  type: "lock",
  gate: "lock",
  requires,
});

const edge = (source: number, target: number, oneway = false): JsonEdge => ({ source, target, oneway });

const dungeon = (nodes: JsonNode[], edges: JsonEdge[]): DungeonJson => ({
  schema_version: 2,
  seed: 1,
  start: 0,
  goal: 1,
  nodes,
  edges,
  objects: [{ id: "k", type: "key", name: "iron key", found_in: [0], opens: [] }],
});

describe("normalize: ruin fixture", () => {
  const graph = normalize(ruin as DungeonJson);

  it("counts rooms and doors", () => {
    expect(graph.rooms.size).toBe(26);
    expect(graph.doors).toHaveLength(27);
    expect(graph.doors.filter((d) => d.gate?.kind === "lock")).toHaveLength(3);
    expect(graph.doors.filter((d) => d.gate?.kind === "state")).toHaveLength(1);
  });

  it("keeps start and goal", () => {
    expect(graph.start).toBe(0);
    expect(graph.goal).toBe(1);
  });

  it("puts gate data on the door between its two rooms", () => {
    const door = graph.doors.find((d) => d.gate?.requires[0]?.id === "TMtovAPQ");
    expect(door).toMatchObject({ a: 6, b: 23, oneway: false });
    expect(door?.gate?.requires.map((o) => o.name)).toEqual(["bronze key 1"]);

    const state = graph.doors.find((d) => d.gate?.kind === "state");
    expect([state?.a, state?.b].sort()).toEqual([17, 26]);
    expect(state?.gate?.requires.map((o) => o.name)).toEqual(["gravestone catch 1", "gravestone catch 2"]);
  });

  it("keeps the 3-room one-way loop with its direction", () => {
    const oneway = graph.doors.filter((d) => d.oneway).map((d) => [d.a, d.b]);
    expect(oneway).toEqual(
      expect.arrayContaining([
        [23, 29],
        [29, 24],
        [24, 23],
      ]),
    );
    expect(oneway).toHaveLength(3);
  });

  it("keeps objects found in each room", () => {
    expect(graph.rooms.get(4)?.objects).toEqual([{ id: "WrfcZq1z", type: "item", name: "blessed censer 1" }]);
    expect(graph.rooms.get(4)).toMatchObject({ number: 16, label: "Pickup: blessed censer 1" });
    expect(graph.rooms.get(2)?.objects).toEqual([]);
  });

  it("has no gate ids left in doors", () => {
    for (const d of graph.doors) {
      expect(graph.rooms.has(d.a)).toBe(true);
      expect(graph.rooms.has(d.b)).toBe(true);
    }
  });
});

describe("normalize: gates", () => {
  it("collapses a gate into one door", () => {
    const g = normalize(dungeon([room(0), room(1), gate(2)], [edge(0, 2), edge(2, 1)]));
    expect(g.doors).toEqual([
      { a: 0, b: 1, oneway: false, gate: { kind: "lock", requires: [{ id: "k", type: "key", name: "iron key" }] } },
    ]);
  });

  it("takes one-way direction from the edges around the gate", () => {
    const g = normalize(dungeon([room(0), room(1), gate(2)], [edge(2, 1, true), edge(0, 2, true)]));
    expect(g.doors).toMatchObject([{ a: 0, b: 1, oneway: true }]);
  });

  it("rejects one-way edges that disagree", () => {
    const nodes = [room(0), room(1), gate(2)];
    expect(() => normalize(dungeon(nodes, [edge(0, 2, true), edge(2, 1)]))).toThrow(/gate 2/);
    expect(() => normalize(dungeon(nodes, [edge(0, 2, true), edge(1, 2, true)]))).toThrow(/gate 2/);
  });

  it("rejects a gate without exactly two neighbours", () => {
    expect(() => normalize(dungeon([room(0), room(1), gate(2)], [edge(0, 2)]))).toThrow(/gate 2.*1 neighbour/);
    expect(() =>
      normalize(dungeon([room(0), room(1), room(3), gate(2)], [edge(0, 2), edge(2, 1), edge(3, 2)])),
    ).toThrow(/gate 2.*3 neighbours/);
  });

  it("rejects a gate next to another gate", () => {
    expect(() =>
      normalize(dungeon([room(0), room(1), gate(2), gate(3)], [edge(0, 2), edge(2, 3), edge(3, 1)])),
    ).toThrow(/gate 2.*gate 3/);
  });

  it("rejects a gate requiring an unknown object", () => {
    expect(() => normalize(dungeon([room(0), room(1), gate(2, ["nope"])], [edge(0, 2), edge(2, 1)]))).toThrow(
      /nope/,
    );
  });
});

describe("normalize: input checks", () => {
  it("rejects other schema versions", () => {
    const d = { ...dungeon([room(0), room(1)], [edge(0, 1)]), schema_version: 1 };
    expect(() => normalize(d)).toThrow(/schema_version 1.*2/);
  });

  it("rejects edges to unknown nodes", () => {
    expect(() => normalize(dungeon([room(0), room(1)], [edge(0, 9)]))).toThrow(/node 9/);
  });

  it("rejects start or goal that is not a room", () => {
    expect(() => normalize({ ...dungeon([room(0), room(1)], [edge(0, 1)]), goal: 7 })).toThrow(/goal 7/);
    expect(() => normalize({ ...dungeon([room(0), room(1), gate(2)], [edge(0, 2), edge(2, 1)]), start: 2 })).toThrow(
      /start 2/,
    );
  });

  it("rejects a room holding an unknown object", () => {
    const r = { ...room(0), objects: ["nope"] };
    expect(() => normalize(dungeon([r, room(1)], [edge(0, 1)]))).toThrow(/room 0.*nope/);
  });

  it("keeps a plain one-way edge as source → target", () => {
    const g = normalize(dungeon([room(0), room(1)], [edge(1, 0, true)]));
    expect(g.doors).toEqual([{ a: 1, b: 0, oneway: true }]);
  });
});
