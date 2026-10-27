import type { DungeonJson, JsonGateNode, JsonObject, JsonRoomNode } from "../types";
import type { Preset } from "./grammar";
import { unsolvableReasons } from "./solve";
import { ROOM_STYLE, SPECIAL_ROOMS, type Theme, type ThemeName } from "./themes";
import type { DGraph } from "./types";

// Schema 2 export (Python utils/dungeon_json.py): every vertex a node, gates included, ids dense
// in vertex order. Rooms carry the GM key number and a themed label.
export type GeneratedNode = (JsonRoomNode | JsonGateNode) & { name: string };
export type GeneratedDungeon = Omit<DungeonJson, "nodes"> & {
  grammar: string;
  size: Preset;
  theme: ThemeName;
  solvable: boolean;
  unsolvable_reasons: string[];
  nodes: GeneratedNode[];
};
export type Meta = { seed: number; size: Preset; theme: ThemeName };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function label(type: string, name: string, rooms: Record<string, string>): string {
  if (type in rooms) return capitalize(rooms[type]!);
  if (type in SPECIAL_ROOMS) return SPECIAL_ROOMS[type]!;
  if (type.startsWith("gb: ")) return `${capitalize(rooms.gb ?? "bonus goal")}: ${type.slice(4)}`;
  if (name.startsWith("Get ")) return `Pickup: ${name.slice(4)}`;
  if (type === "switch") return `Switch: ${name}`;
  if (type === "lever") return `Lever: ${name} (starts OFF)`;
  if (type in ROOM_STYLE) return capitalize(ROOM_STYLE[type]!);
  return name;
}

// Room → number, breadth first from START over room–room and room–gate–room links, neighbours by
// id; rooms out of reach follow in id order. No gate chains (reduce asserts it), so a gate links
// exactly the rooms next to it.
function numbers(g: DGraph, start: number): Map<number, number> {
  const rooms = g.vertices().flatMap(([id, v]) => (v.gate ? [] : [id]));
  const linked = new Map(rooms.map((id) => [id, new Set<number>()]));
  const link = (a: number, b: number) => {
    if (a === b) return;
    linked.get(a)!.add(b);
    linked.get(b)!.add(a);
  };
  for (const e of g.edges()) if (linked.has(e.source) && linked.has(e.target)) link(e.source, e.target);
  for (const [id, v] of g.vertices()) {
    if (!v.gate) continue;
    const ends = [...new Set(g.incident(id).map((e) => (e.source === id ? e.target : e.source)))];
    for (const a of ends) for (const b of ends) if (a < b) link(a, b);
  }
  const order = [start];
  const seen = new Set(order);
  for (let i = 0; i < order.length; i++) {
    for (const n of [...linked.get(order[i]!)!].sort((a, b) => a - b)) {
      if (seen.has(n)) continue;
      seen.add(n);
      order.push(n);
    }
  }
  for (const id of rooms) if (!seen.has(id)) order.push(id);
  return new Map(order.map((id, i) => [id, i + 1]));
}

export function dungeonJson(g: DGraph, meta: Meta, theme: Theme): GeneratedDungeon {
  const vertices = g.vertices();
  const dense = new Map(vertices.map(([id], i) => [id, i]));
  const at = (type: string) => dense.get(vertices.find(([, v]) => v.type === type)![0])!;
  const num = numbers(g, vertices.find(([, v]) => v.type === "st")![0]);
  const nodes = vertices.map(([id, v]): GeneratedNode => {
    const base = { id: dense.get(id)!, type: v.type, name: v.name };
    const ids = v.objects.map((o) => o.id);
    if (v.gate) return { ...base, kind: "gate", gate: v.gate, requires: ids };
    return { ...base, kind: "room", objects: ids, number: num.get(id)!, label: label(v.type, v.name, theme.rooms) };
  });
  const objects = new Map<string, JsonObject>();
  for (const [id, v] of vertices) {
    for (const o of v.objects) {
      if (!objects.has(o.id)) objects.set(o.id, { id: o.id, type: o.type, name: o.name, found_in: [], opens: [] });
      objects.get(o.id)![v.gate ? "opens" : "found_in"].push(dense.get(id)!);
    }
  }
  const reasons = unsolvableReasons(g);
  return {
    schema_version: 2,
    grammar: "Combined",
    ...meta,
    start: at("st"),
    goal: at("gl"),
    solvable: !reasons.length,
    unsolvable_reasons: reasons,
    nodes,
    edges: g.edges().map((e) => ({ source: dense.get(e.source)!, target: dense.get(e.target)!, oneway: e.attrs.oneway })),
    objects: [...objects.values()],
  };
}
