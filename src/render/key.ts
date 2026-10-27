import type { DungeonJson, JsonGateNode, JsonNode, JsonRoomNode } from "../engine/types";

// GM key in Markdown (Python utils/dungeon_key.py), from the schema 2 JSON: normalize drops gate
// ids, and the key groups doors by gate. Gates show up as conditions on the exits that cross them.

type Exit = { gates: number[]; oneway: boolean };

// Room id → {room id: gates crossed, one-way} (Python dungeon_json._exits): walks from each room
// through gates until it reaches a room, neighbours by id; the first path to a room is kept.
function exits(json: DungeonJson, nodes: Map<number, JsonNode>): Map<number, Map<number, Exit>> {
  const walks = new Map(json.nodes.map((n) => [n.id, [] as [number, boolean][]]));
  for (const e of json.edges) {
    walks.get(e.source)!.push([e.target, e.oneway]);
    if (!e.oneway) walks.get(e.target)!.push([e.source, false]);
  }
  for (const w of walks.values()) w.sort((a, b) => a[0] - b[0] || Number(a[1]) - Number(b[1]));
  const result = new Map<number, Map<number, Exit>>();
  for (const node of json.nodes) {
    if (node.kind !== "room") continue;
    const found = new Map<number, Exit>();
    const stack: [number, number[], boolean][] = [[node.id, [], false]];
    const seen = new Set([node.id]);
    while (stack.length) {
      const [id, gates, oneway] = stack.pop()!;
      for (const [next, one] of walks.get(id)!) {
        if (seen.has(next)) continue;
        seen.add(next);
        if (nodes.get(next)!.kind === "room") {
          if (!found.has(next)) found.set(next, { gates, oneway: oneway || one });
        } else stack.push([next, [...gates, next], oneway || one]);
      }
    }
    result.set(node.id, found);
  }
  return result;
}

function condition(gate: JsonGateNode, names: Map<string, string>): string {
  const needs = gate.requires.map((id) => names.get(id)).join(" + ");
  if (gate.gate === "secret") return "secret";
  if (gate.gate === "lock") return `locked: ${needs}`;
  if (gate.gate === "on") return `${needs} ON`;
  if (gate.gate === "off") return `${needs} OFF, open at start`;
  return `needs ${needs}`;
}

export function dungeonKey(json: DungeonJson): string {
  const nodes = new Map(json.nodes.map((n) => [n.id, n]));
  const room = (id: number) => nodes.get(id) as JsonRoomNode;
  const gateNode = (id: number) => nodes.get(id) as JsonGateNode;
  const names = new Map(json.objects.map((o) => [o.id, o.name]));
  const exitsOf = exits(json, nodes);
  const num = (id: number) => room(id).number;
  const byNumber = (a: number, b: number) => num(a) - num(b);
  const door = (a: number, b: number, oneway: boolean) =>
    oneway ? `${num(a)} → ${num(b)}` : `${Math.min(num(a), num(b))} ↔ ${Math.max(num(a), num(b))}`;
  const rooms = [...exitsOf.keys()].sort(byNumber);
  const reasons = json.unsolvable_reasons ?? [];

  const summary = [
    ...(json.seed !== undefined ? [`Seed ${json.seed}`] : []),
    ...(json.size !== undefined ? [`size ${json.size}`] : []),
    ...(json.theme !== undefined ? [`theme ${json.theme}`] : []),
    `${rooms.length} rooms`,
    // Python requires the field; a hand-written JSON may lack it, then the key says nothing.
    ...(json.solvable === undefined ? [] : [json.solvable ? "solvable" : "**unsolvable**"]),
  ];
  const lines = [`# GM key: ${json.grammar ?? "Generated"} dungeon`, "", summary.join(" · "), ""];
  lines.push(...reasons.map((r) => `- ${r}`), ...(reasons.length ? [""] : []));

  const doors = new Map<number, Set<string>>(); // gate id → doors it guards, in first-seen order
  lines.push("## Rooms", "");
  for (const id of rooms) {
    const exitMap = exitsOf.get(id)!;
    const links = [...exitMap.keys()].sort(byNumber).map((target) => {
      const { gates, oneway } = exitMap.get(target)!;
      for (const g of gates) {
        if (!doors.has(g)) doors.set(g, new Set());
        doors.get(g)!.add(door(id, target, oneway));
      }
      const tags = [...gates.map((g) => condition(gateNode(g), names)), ...(oneway ? ["one-way"] : [])];
      return tags.length ? `${num(target)} (${tags.join(", ")})` : String(num(target));
    });
    lines.push(`${num(id)}. **${room(id).label}**. Exits: ${links.join(", ") || "none"}`);
  }

  if (json.objects.length) {
    lines.push("", "## Keys", "", "| Object | Found in | Opens |", "|--------|----------|-------|");
    for (const obj of json.objects) {
      const found = obj.found_in.map(num).sort((a, b) => a - b).join(", ");
      const opens = obj.opens.flatMap((g) => {
        const gate = gateNode(g);
        const others = gate.requires.filter((id) => id !== obj.id).map((id) => names.get(id));
        const suffix =
          gate.gate === "on" || gate.gate === "off" ? ` (${gate.gate.toUpperCase()})` : gate.requires.length > 1 ? ` (+ ${others.join(" + ")})` : "";
        return [...(doors.get(g) ?? [])].map((d) => d + suffix);
      });
      lines.push(`| ${obj.name} | ${found || "none"} | ${[...new Set(opens)].join(", ")} |`);
    }
  }
  return lines.join("\n") + "\n";
}
