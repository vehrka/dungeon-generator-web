import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { defaultConfig } from "../src/engine/config";
import { generate } from "../src/engine/index";
import { polygon, rectangle, translate, type Segment } from "../src/engine/geometry";
import type { Layout } from "../src/engine/layout";
import type { DungeonJson, RoomGraph } from "../src/engine/types";
import { scene } from "../src/render/scene";

const json = ruin as DungeonJson;
const { graph, layout } = generate(json, json.seed, defaultConfig);
const s = scene(graph, layout);

const two = (doors: RoomGraph["doors"]): RoomGraph => ({
  rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])),
  doors,
  start: 0,
  goal: 1,
});
const shape = { id: "rect-3x3", outline: rectangle(3, 3) };
const segment = { from: { x: 1, y: 3 }, to: { x: 2, y: 3 } };
// Room 0 above room 1, every door on the shared wall y 3, x 1–2.
const stacked = (doors: RoomGraph["doors"]) =>
  scene(two(doors), {
    placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 3 } }],
    doors: doors.map((door) => ({ door, segment })),
  });

describe("scene", () => {
  it("has one room per placement, outline translated, in placement order", () => {
    expect(s.rooms.map((r) => r.id)).toEqual(layout.placements.map((pl) => pl.room));
    for (const [i, pl] of layout.placements.entries()) {
      expect(s.rooms[i]!.outline).toEqual(translate(pl.shape.outline, pl.at));
      expect(s.rooms[i]!.number).toBe(graph.rooms.get(pl.room)!.number);
    }
  });

  it("has one corridor per distinct corridor shape and position", () => {
    const keys = new Set(layout.doors.flatMap(({ corridor: c }) => (c ? [`${c.shape.id}@${c.at.x},${c.at.y}`] : [])));
    expect(keys.size).toBeGreaterThan(0);
    expect(s.corridors).toHaveLength(keys.size);
    expect(scene(graph, { ...layout, doors: layout.doors.map(({ corridor: _, ...d }) => d) }).corridors).toEqual([]);
  });

  it("groups doors by segment or corridor and letters the gated groups", () => {
    const key = (x: Segment) => `${x.from.x},${x.from.y},${x.to.x},${x.to.y}`;
    const groups = new Set(layout.doors.map((d) => (d.corridor ? `${d.corridor.shape.id}@${d.corridor.at.x},${d.corridor.at.y}` : key(d.segment))));
    expect(s.doors).toHaveLength(groups.size);
    const tagged = s.doors.filter((d) => d.tag);
    expect(tagged.map((d) => d.tag)).toEqual(["A", "B", "C", "D"]);
    expect(tagged.flatMap((d) => d.gates.map((g) => g.kind)).sort()).toEqual(["lock", "lock", "lock", "state"]);
    expect(s.doors.filter((d) => !d.tag).every((d) => d.gates.length === 0)).toBe(true);
  });

  it("bounds rooms and corridors", () => {
    const pts = [...s.rooms.map((r) => r.outline), ...s.corridors].flat();
    expect(s.bbox).toEqual({ x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) });
  });

  it("lists start, goal, objects and treasure as glyphs", () => {
    const glyphs = new Set(s.rooms.flatMap((r) => r.glyphs));
    for (const g of ["start", "goal", "key", "bosskey", "item", "switch", "treasure"]) expect(glyphs).toContain(g);
    expect(s.rooms.find((r) => r.id === graph.start)!.glyphs[0]).toBe("start");
  });

  it("draws unknown object types, prototype keys too, as items", () => {
    const objects = ["rope", "constructor", "toString"].map((type) => ({ id: type, type, name: type }));
    const g: RoomGraph = { rooms: new Map([[0, { id: 0, type: "n", number: 1, label: "R0", objects }]]), doors: [], start: 1, goal: 1 };
    expect(scene(g, { placements: [{ room: 0, shape, at: { x: 0, y: 0 } }], doors: [] }).rooms[0]!.glyphs).toEqual(["item", "item", "item"]);
  });

  it("marks a group secret or one-way only when all its doors are", () => {
    const door = (doors: RoomGraph["doors"]) => stacked(doors).doors;
    const secret = { kind: "secret" as const, requires: [] };
    expect(door([{ a: 0, b: 1, oneway: true }, { a: 0, b: 1, oneway: true }])).toMatchObject([{ oneway: 1, secret: false }]);
    expect(door([{ a: 1, b: 0, oneway: true }])).toMatchObject([{ oneway: -1 }]);
    expect(door([{ a: 0, b: 1, oneway: true }, { a: 0, b: 1, oneway: false }])[0]!.oneway).toBeUndefined();
    expect(door([{ a: 0, b: 1, oneway: true }, { a: 1, b: 0, oneway: true }])[0]!.oneway).toBeUndefined();
    expect(door([{ a: 0, b: 1, oneway: false, gate: secret }])).toMatchObject([{ secret: true, gates: [] }]);
    expect(door([{ a: 0, b: 1, oneway: false, gate: secret }, { a: 0, b: 1, oneway: false }])).toMatchObject([{ secret: false }]);
  });

  it("sides room a by the cell next to the door, not its bounding box", () => {
    // L room 0 with its top-right block cut out; room 1 in the cut, door on the inner wall y 7,
    // x 5–6. Room 0 is below the door, its bounding-box centre (y 5) above it.
    const g = two([{ a: 0, b: 1, oneway: true }]);
    const l: Layout = {
      placements: [
        { room: 0, shape: { id: "l", outline: polygon([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 10 }, { x: 0, y: 10 }]) }, at: { x: 0, y: 0 } },
        { room: 1, shape, at: { x: 5, y: 4 } },
      ],
      doors: [{ door: g.doors[0]!, segment: { from: { x: 5, y: 7 }, to: { x: 6, y: 7 } } }],
    };
    expect(scene(g, l).doors[0]!.oneway).toBe(-1);
  });

  it("anchors the number in the middle of the longest arm of a lying L", () => {
    const g: RoomGraph = { rooms: new Map([[0, { id: 0, type: "n", number: 1, label: "R0", objects: [] }]]), doors: [], start: 0, goal: 0 };
    const outline = polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 5 }, { x: 0, y: 5 }]);
    expect(scene(g, { placements: [{ room: 0, shape: { id: "l", outline }, at: { x: 0, y: 0 } }], doors: [] }).rooms[0]!.anchor).toEqual({ x: 5, y: 1.5 });
  });

  it("sides both ends of a corridor by the room past them", () => {
    const g = two([{ a: 0, b: 1, oneway: false, gate: { kind: "lock", requires: [] } }]);
    const l: Layout = {
      placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 4 } }],
      doors: [
        {
          door: g.doors[0]!,
          segment,
          corridor: { shape: { id: "corridor-v1", outline: rectangle(1, 1) }, at: { x: 1, y: 3 }, segment: { from: { x: 1, y: 4 }, to: { x: 2, y: 4 } } },
        },
      ],
    };
    // room a above its door, so the corridor below it; room b below its door, the corridor above
    expect(scene(g, l).doors).toEqual([
      { segment, gates: [{ kind: "lock", requires: [] }], tag: "A", secret: false, corridor: { segment: { from: { x: 1, y: 4 }, to: { x: 2, y: 4 } }, sideA: 1, sideB: -1 } },
    ]);
  });
});
