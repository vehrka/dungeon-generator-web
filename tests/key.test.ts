import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import type { DungeonJson, GateKind, JsonEdge, JsonNode, JsonObject } from "../src/engine/types";
import { dungeonKey } from "../src/render/key";

const golden = readFileSync(join(import.meta.dirname, "fixtures", "ruin-key.md"), "utf8");

const room = (id: number, number = id + 1): JsonNode => ({ id, kind: "room", type: "n", objects: [], number, label: `Room ${number}` });
const gate = (id: number, kind: GateKind, requires: string[]): JsonNode => ({ id, kind: "gate", type: kind, gate: kind, requires });
const edge = (source: number, target: number, oneway = false): JsonEdge => ({ source, target, oneway });
const obj = (id: string, found_in: number[], opens: number[]): JsonObject => ({ id, type: "key", name: id, found_in, opens });
const dungeon = (nodes: JsonNode[], edges: JsonEdge[], objects: JsonObject[] = [], extra: Partial<DungeonJson> = {}): DungeonJson => ({
  schema_version: 2,
  seed: 1,
  start: 0,
  goal: 1,
  solvable: true,
  unsolvable_reasons: [],
  nodes,
  edges,
  objects,
  ...extra,
});
const roomsSection = (key: string) => key.split("## Rooms\n\n")[1]!.split("\n\n")[0]!.trimEnd().split("\n");

describe("dungeonKey", () => {
  it("matches the Python key of ruin.json byte for byte", () => {
    expect(dungeonKey(ruin as DungeonJson)).toBe(golden);
  });

  it("writes each gate condition on the exits that cross it", () => {
    const kinds: GateKind[] = ["lock", "state", "on", "off", "secret"];
    const nodes = [room(0), ...kinds.map((_, i) => room(i + 1)), ...kinds.map((k, i) => gate(10 + i, k, ["a"]))];
    const edges = kinds.flatMap((_, i) => [edge(0, 10 + i), edge(10 + i, i + 1)]);
    const lines = roomsSection(dungeonKey(dungeon(nodes, edges, [obj("a", [0], kinds.map((_, i) => 10 + i))])));
    expect(lines[0]).toBe("1. **Room 1**. Exits: 2 (locked: a), 3 (needs a), 4 (a ON), 5 (a OFF, open at start), 6 (secret)");
    expect(lines[1]).toBe("2. **Room 2**. Exits: 1 (locked: a)");
  });

  it("lists a one-way exit only from the room it leaves", () => {
    const lines = roomsSection(dungeonKey(dungeon([room(0), room(1), room(2)], [edge(0, 1, true), edge(1, 2)])));
    expect(lines).toEqual(["1. **Room 1**. Exits: 2 (one-way)", "2. **Room 2**. Exits: 3", "3. **Room 3**. Exits: 2"]);
  });

  it("writes none for a room without exits", () => {
    expect(roomsSection(dungeonKey(dungeon([room(0), room(1)], [edge(1, 0, true)])))[0]).toBe("1. **Room 1**. Exits: none");
  });

  it("suffixes doors that need other objects or a state", () => {
    const nodes = [room(0), room(1), room(2), gate(3, "state", ["a", "b"]), gate(4, "on", ["a"])];
    const edges = [edge(0, 3), edge(3, 1), edge(1, 4), edge(4, 2, true)];
    const key = dungeonKey(dungeon(nodes, edges, [obj("a", [0], [3, 4]), obj("b", [2], [3])]));
    expect(key).toContain("| a | 1 | 1 ↔ 2 (+ b), 2 → 3 (ON) |\n| b | 3 | 1 ↔ 2 (+ a) |\n");
  });

  it("has no keys table without objects", () => {
    expect(dungeonKey(dungeon([room(0), room(1)], [edge(0, 1)]))).not.toContain("## Keys");
  });

  it("lists unsolvable reasons under the header", () => {
    const key = dungeonKey(dungeon([room(0), room(1)], [edge(0, 1)], [], { solvable: false, unsolvable_reasons: ["GOAL out of reach", "x"] }));
    expect(key).toBe(
      "# GM key: Generated dungeon\n\nSeed 1 · 2 rooms · **unsolvable**\n\n- GOAL out of reach\n- x\n\n## Rooms\n\n" +
        "1. **Room 1**. Exits: 2\n2. **Room 2**. Exits: 1\n",
    );
  });

  it("numbers rooms by their JSON number, not their id", () => {
    const lines = roomsSection(dungeonKey(dungeon([room(0, 1), room(1, 3), room(2, 2)], [edge(0, 2), edge(2, 1)])));
    expect(lines).toEqual(["1. **Room 1**. Exits: 2", "2. **Room 2**. Exits: 1, 3", "3. **Room 3**. Exits: 2"]);
  });
});
