import { describe, expect, it } from "vitest";
import { generateDungeon } from "../../src/engine/generator/index";
import { dungeonJson, label } from "../../src/engine/generator/json";
import { THEMES } from "../../src/engine/generator/themes";
import { build, GOAL, KEY, LOCK, PICKUP, room, START } from "./build";

const meta = { seed: 42, size: "M" as const, theme: "zelda" as const };

describe("json", () => {
  it("exports gates, rooms, objects and numbers with dense ids", () => {
    const g = build([START, GOAL, room("n"), LOCK, PICKUP], [[0, 4], [0, 3], [3, 1]]);
    g.deleteVertex(2);
    const data = dungeonJson(g, meta, THEMES.zelda);
    expect(data).toMatchObject({ schema_version: 2, grammar: "Combined", seed: 42, size: "M", start: 0, goal: 1, solvable: true, unsolvable_reasons: [] });
    expect(data.nodes[2]).toEqual({ id: 2, type: "lock", name: "Use spam key 1", kind: "gate", gate: "lock", requires: [KEY.id] });
    expect(data.nodes[3]).toEqual({ id: 3, type: "key", name: "Get spam key 1", kind: "room", objects: [KEY.id], number: 3, label: "Pickup: spam key 1" });
    expect(data.nodes.map((n) => (n.kind === "room" ? n.number : null))).toEqual([1, 2, null, 3]);
    expect(data.edges).toEqual([
      { source: 0, target: 3, oneway: false },
      { source: 0, target: 2, oneway: false },
      { source: 2, target: 1, oneway: false },
    ]);
    expect(data.objects).toEqual([{ id: KEY.id, type: "key", name: "spam key 1", found_in: [3], opens: [2] }]);
  });

  it("numbers breadth first from START, by id among siblings, through gates", () => {
    // 0 – 4, 0 – 2, 2 – gate 5 – 3, 4 – 1
    const g = build([START, GOAL, room("e"), room("t"), room("p"), LOCK, PICKUP], [[0, 4], [0, 2], [2, 5], [5, 3], [4, 1], [0, 6]]);
    const rooms = dungeonJson(g, meta, THEMES.zelda).nodes.flatMap((n) => (n.kind === "room" ? [[n.id, n.number]] : []));
    expect(rooms).toEqual([[0, 1], [1, 6], [2, 2], [3, 5], [4, 3], [6, 4]]);
  });

  it("reports an unsolvable graph", () => {
    const data = dungeonJson(build([START, GOAL, LOCK], [[0, 2], [2, 1]]), meta, THEMES.zelda);
    expect(data.solvable).toBe(false);
    expect(data.unsolvable_reasons).toEqual(["GOAL unreachable", "Use spam key 1 needs spam key 1"]);
    expect(data.objects[0]!.found_in).toEqual([]);
  });

  it("labels rooms per rule", () => {
    const l = (type: string, name = type, theme = THEMES.zelda) => label(type, name, theme.rooms);
    expect(l("st", "START")).toBe("Entrance (START)");
    expect(l("st", "START", THEMES.cyber)).toBe("Jack-in point (START)");
    expect(l("exit", "EXIT")).toBe("Extra entrance (EXIT)");
    expect(l("gb: rupees")).toBe("Bonus goal: rupees");
    expect(l("gb: paydata", "gb: paydata", THEMES.cyber)).toBe("Data cache: paydata");
    expect(l("bosskey", "Get boss key 1")).toBe("Pickup: boss key 1");
    expect(l("switch", "switch 2")).toBe("Switch: switch 2");
    expect(l("lever", "lever 1")).toBe("Lever: lever 1 (starts OFF)");
    expect(l("c")).toBe("Challenge (skill check)");
    expect(l("e", "e", THEMES.cyber)).toBe("ICE");
    expect(l("spam")).toBe("spam");
  });

  it("generated dungeon: dense ids, objects found and opening their gates, numbers 1…n", () => {
    const data = generateDungeon({ seed: 15143, size: "M" });
    expect(data.nodes.map((n) => n.id)).toEqual(data.nodes.map((_, i) => i));
    const rooms = data.nodes.filter((n) => n.kind === "room");
    expect(rooms.map((n) => n.number).sort((a, b) => a - b)).toEqual(rooms.map((_, i) => i + 1));
    expect(data.nodes[data.start]).toMatchObject({ type: "st", number: 1 });
    for (const o of data.objects) {
      expect(o.found_in.length, o.id).toBe(1);
      for (const gid of o.opens) expect(data.nodes[gid]).toMatchObject({ kind: "gate", requires: expect.arrayContaining([o.id]) });
    }
  });

  it("same options give byte-identical JSON; theme changes text only", () => {
    const a = generateDungeon({ seed: 9, size: "L", theme: "tor-barrow" });
    expect(JSON.stringify(generateDungeon({ seed: 9, size: "L", theme: "tor-barrow" }))).toBe(JSON.stringify(a));
    const shape = (d: typeof a) => JSON.stringify([d.edges, d.nodes.map((n) => [n.id, n.kind, n.kind === "room" ? n.number : n.gate])]);
    expect(shape(generateDungeon({ seed: 9, size: "L" }))).toBe(shape(a));
    expect(a.theme).toBe("tor-barrow");
  });

  it("rejects bad options", () => {
    expect(() => generateDungeon({ seed: -1 })).toThrow("Invalid dungeon seed -1");
    expect(() => generateDungeon({ seed: 1, theme: "spam" as never })).toThrow("Unknown theme spam");
  });
});

