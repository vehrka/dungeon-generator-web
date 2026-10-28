import { bbox, partition, translate, type Point, type Polygon, type Rect, type Segment } from "../engine/geometry";
import type { Layout, PlacedDoor } from "../engine/layout";
import type { Gate, RoomGraph, RoomId } from "../engine/types";
import { glyphs } from "./icons";

// Style-free geometry of a map in grid units: every painter (catalogue, Dyson) draws from this.
export type SceneRoom = { id: RoomId; number: number; outline: Polygon; anchor: Point; glyphs: string[] };
export type SceneDoor = {
  segment: Segment; // the door; through a corridor, the one on room a
  gates: Gate[]; // the group's gates but secret
  tag?: string; // A, B, … when there are gates
  secret: boolean;
  oneway?: 1 | -1; // room a's side of the door: +1 above or left, so pointing down or right
  corridor?: { segment: Segment; sideA: 1 | -1; sideB: 1 | -1 }; // the door on room b; +1 corridor below or right of a door
};
export type Scene = { rooms: SceneRoom[]; corridors: Polygon[]; doors: SceneDoor[]; bbox: Rect };

// A, B, … Z, AA, AB, …
const letter = (i: number): string => (i < 26 ? "" : letter(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));

// Room glyphs: start/goal, then the objects found there, then treasure for bonus goals.
function roomGlyphs(graph: RoomGraph, id: RoomId): string[] {
  const room = graph.rooms.get(id)!;
  return [
    ...(id === graph.start ? ["start"] : []),
    ...(id === graph.goal ? ["goal"] : []),
    ...room.objects.map((o) => (Object.hasOwn(glyphs, o.type) ? o.type : "item")), // unknown object types draw as items
    ...(room.type.split(":")[0] === "gb" ? ["treasure"] : []),
  ];
}

export function scene(graph: RoomGraph, layout: Layout): Scene {
  const outlines = new Map<RoomId, Polygon>(layout.placements.map((pl) => [pl.room, translate(pl.shape.outline, pl.at)]));
  // Doors between the same two rooms share a corridor; one polygon each.
  const corridorKey = (c: NonNullable<PlacedDoor["corridor"]>) => `${c.shape.id}@${c.at.x},${c.at.y}`;
  const corridors = new Map(layout.doors.flatMap(({ corridor: c }) => (c ? [[corridorKey(c), translate(c.shape.outline, c.at)] as const] : [])));
  const cells = new Map([...outlines].map(([id, o]) => [id, partition(o)]));
  // +1 when room a lies before the door (above or left): the grid cell below or right of the
  // door's start is not in a. A bounding-box centre can sit on the wrong side of an L.
  const side = (a: RoomId, s: Segment): 1 | -1 => {
    const q = { x: s.from.x + 0.5, y: s.from.y + 0.5 };
    return cells.get(a)!.some((r) => r.x0 <= q.x && q.x <= r.x1 && r.y0 <= q.y && q.y <= r.y1) ? -1 : 1;
  };

  const rooms = [...outlines].map(([id, outline]): SceneRoom => {
    // Number and glyphs in the middle of the largest rectangle of both slab cuts, so an L, T or
    // plus keeps them inside its longest arm.
    const r = [...cells.get(id)!, ...partition(outline, "rows")].reduce((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a));
    return { id, number: graph.rooms.get(id)!.number, outline, anchor: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, glyphs: roomGlyphs(graph, id) };
  });

  // Doors between the same two rooms share a segment or a corridor: one door for all their gates;
  // secret and one-way only when every door of the group is (opposite one-ways cross both ways).
  const groups = new Map<string, PlacedDoor[]>();
  for (const d of layout.doors) {
    const k = d.corridor ? corridorKey(d.corridor) : `${d.segment.from.x},${d.segment.from.y},${d.segment.to.x},${d.segment.to.y}`;
    if (groups.has(k)) groups.get(k)!.push(d);
    else groups.set(k, [d]);
  }
  let tags = 0;
  const doors = [...groups.values()].map((group): SceneDoor => {
    const [first] = group as [PlacedDoor];
    const gates = group.flatMap((d) => (d.door.gate && d.door.gate.kind !== "secret" ? [d.door.gate] : []));
    const oneway = group.every((d) => d.door.oneway && d.door.a === first.door.a);
    const sideA = side(first.door.a, first.segment);
    return {
      segment: first.segment,
      gates,
      ...(gates.length ? { tag: letter(tags++) } : {}),
      secret: group.every((d) => d.door.gate?.kind === "secret"),
      ...(oneway ? { oneway: sideA } : {}),
      ...(first.corridor ? { corridor: { segment: first.corridor.segment, sideA, sideB: side(first.door.b, first.corridor.segment) } } : {}),
    };
  });

  return {
    rooms,
    corridors: [...corridors.values()],
    doors,
    bbox: bbox([...outlines.values(), ...corridors.values()].flat()),
  };
}
