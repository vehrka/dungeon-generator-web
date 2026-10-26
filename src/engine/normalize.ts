import type { DungeonJson, Door, GameObject, JsonEdge, JsonGateNode, JsonNode, Room, RoomGraph, RoomId } from "./types";

// Collapse every room – gate – room path into one door edge between the two rooms.
export function normalize(json: DungeonJson): RoomGraph {
  if (json.schema_version !== 2) {
    throw new Error(`Unsupported schema_version ${json.schema_version}, expected 2`);
  }

  const objects = new Map<string, GameObject>(json.objects.map((o) => [o.id, { id: o.id, type: o.type, name: o.name }]));
  const object = (id: string, where: string): GameObject => {
    const o = objects.get(id);
    if (!o) throw new Error(`${where} refers to unknown object ${id}`);
    return o;
  };

  const nodes = new Map<number, JsonNode>(json.nodes.map((n) => [n.id, n]));
  const rooms = new Map<RoomId, Room>();
  for (const n of json.nodes) {
    if (n.kind !== "room") continue;
    rooms.set(n.id, {
      id: n.id,
      type: n.type,
      number: n.number,
      label: n.label,
      objects: n.objects.map((id) => object(id, `room ${n.id}`)),
    });
  }

  for (const [name, id] of [["start", json.start], ["goal", json.goal]] as const) {
    if (!rooms.has(id)) throw new Error(`${name} ${id} is not a room`);
  }

  const doors: Door[] = [];
  const gateEdges = new Map<number, JsonEdge[]>();
  for (const e of json.edges) {
    const ends = [nodes.get(e.source), nodes.get(e.target)];
    for (const [i, n] of ends.entries()) {
      if (!n) throw new Error(`Edge ${e.source} → ${e.target} refers to unknown node ${i === 0 ? e.source : e.target}`);
      if (n.kind === "gate") gateEdges.set(n.id, [...(gateEdges.get(n.id) ?? []), e]);
    }
    if (ends.every((n) => n?.kind === "room")) doors.push({ a: e.source, b: e.target, oneway: e.oneway });
  }

  for (const n of json.nodes) {
    if (n.kind === "gate") doors.push(gateDoor(n, gateEdges.get(n.id) ?? [], nodes, object));
  }

  return { rooms, doors, start: json.start, goal: json.goal };
}

function gateDoor(
  gate: JsonGateNode,
  edges: JsonEdge[],
  nodes: Map<number, JsonNode>,
  object: (id: string, where: string) => GameObject,
): Door {
  const where = `gate ${gate.id}`;
  if (edges.length !== 2) {
    throw new Error(`${where} has ${edges.length} neighbour${edges.length === 1 ? "" : "s"}, expected 2 rooms`);
  }
  const other = (e: JsonEdge) => (e.source === gate.id ? e.target : e.source);
  for (const e of edges) {
    const n = nodes.get(other(e));
    if (n?.kind !== "room") throw new Error(`${where} is next to ${n?.kind} ${other(e)}, expected a room`);
  }

  const kept = { kind: gate.gate, requires: gate.requires.map((id) => object(id, where)) };
  const [e1, e2] = edges as [JsonEdge, JsonEdge];
  if (!e1.oneway && !e2.oneway) return { a: other(e1), b: other(e2), oneway: false, gate: kept };

  const into = edges.find((e) => e.oneway && e.target === gate.id);
  const out = edges.find((e) => e.oneway && e.source === gate.id);
  if (!into || !out) throw new Error(`${where} has one-way edges that disagree on direction`);
  return { a: into.source, b: out.target, oneway: true, gate: kept };
}
