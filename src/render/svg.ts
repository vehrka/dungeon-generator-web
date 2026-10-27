import type { LayoutConfig } from "../engine/config";
import { bbox, partition, translate, type Point, type Polygon, type Segment } from "../engine/geometry";
import { generate } from "../engine/index";
import type { Layout, PlacedDoor } from "../engine/layout";
import { isSeed } from "../engine/rng";
import type { DungeonJson, Gate, RoomGraph, RoomId } from "../engine/types";
import { defs, glyphs, glyphSize } from "./icons";

export type RenderMeta = { seed?: number; layoutSeed: number; theme?: string; size?: string; grammar?: string };

// Teenage engineering style (ref/webdesign/design.md): neutrals, hairlines, weight 100/300, no
// radius or shadow. Amber is the one chromatic note, kept for gates (docs/plans/09-render-cli.md).
const unit = 24; // px per grid unit
const margin = 33;
const gap = 66;
const titleHeight = 66;
const line = 20;
const charWidth = 7.5; // rough width of a 13 px character, sizes the key column and the title
const titleCharWidth = 11; // the same at 19 px
const amber = "#f0a000";

const style = `<style>
text{font-family:Inter,'Helvetica Neue',Arial,'Noto Sans','DejaVu Sans',sans-serif;font-size:13px;font-weight:100;fill:#000}
.room{fill:#fff;stroke:#000;stroke-width:1}
.corridor{fill:#e5e5e5;stroke:#000;stroke-width:1}
.number{font-size:19px;font-weight:300;text-anchor:middle}
.gap{fill:#fff}
.gap-corridor{fill:#e5e5e5}
.jamb,.dash{stroke:#000;stroke-width:1}
.dash{stroke-dasharray:2 2}
.oneway{fill:none;stroke:#000;stroke-width:1.5}
.tag{fill:${amber}}
.tag-letter{font-size:10px;font-weight:300;text-anchor:middle}
.glyph{fill:none;stroke:#000;stroke-width:1}
.title{font-size:19px;font-weight:300}
.muted{fill:#b2b2b2}
.heading{font-weight:300}
.rule{stroke:#e5e5e5;stroke-width:1}
</style>`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A, B, … Z, AA, AB, …
const letter = (i: number): string => (i < 26 ? "" : letter(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));

const gateText = (g: Gate) => [g.kind, g.requires.map((o) => o.name).join(", ")].filter(Boolean).join("  ");

// Room glyphs: start/goal, then the objects found there, then treasure for bonus goals.
function roomGlyphs(graph: RoomGraph, id: RoomId): string[] {
  const room = graph.rooms.get(id)!;
  return [
    ...(id === graph.start ? ["start"] : []),
    ...(id === graph.goal ? ["goal"] : []),
    ...room.objects.map((o) => (o.type in glyphs ? o.type : "item")), // unknown object types draw as items
    ...(room.type.split(":")[0] === "gb" ? ["treasure"] : []),
  ];
}

// Graph + layout → standalone SVG: map on the left, key column (rooms, gates, legend) on the right.
export function render(graph: RoomGraph, layout: Layout, meta: RenderMeta): string {
  const outlines = new Map<RoomId, Polygon>(layout.placements.map((pl) => [pl.room, translate(pl.shape.outline, pl.at)]));
  // Doors between the same two rooms share a corridor; one polygon each.
  const corridorKey = (c: NonNullable<PlacedDoor["corridor"]>) => `${c.shape.id}@${c.at.x},${c.at.y}`;
  const corridors = new Map(layout.doors.flatMap(({ corridor: c }) => (c ? [[corridorKey(c), translate(c.shape.outline, c.at)] as const] : [])));
  const all = bbox([...outlines.values(), ...corridors.values()].flat());
  const mapWidth = (all.x1 - all.x0) * unit;
  const mapHeight = (all.y1 - all.y0) * unit;
  const top = margin + titleHeight;
  const px = (p: Point) => ({ x: margin + (p.x - all.x0) * unit, y: top + (p.y - all.y0) * unit });
  // +1 when room a lies before the door (above or left): the grid cell below or right of the
  // door's start is not in a. A bounding-box centre can sit on the wrong side of an L.
  const side = (a: RoomId, s: Segment): 1 | -1 => {
    const q = { x: s.from.x + 0.5, y: s.from.y + 0.5 };
    return partition(outlines.get(a)!).some((r) => r.x0 <= q.x && q.x <= r.x1 && r.y0 <= q.y && q.y <= r.y1) ? -1 : 1;
  };

  const points = (outline: Polygon) => outline.map((q) => `${px(q).x},${px(q).y}`).join(" ");
  const map: string[] = [...corridors.values()].map((c) => `<polygon class="corridor" points="${points(c)}"/>`);
  const usedGlyphs = new Set<string>();
  for (const [id, outline] of outlines) {
    const room = graph.rooms.get(id)!;
    map.push(`<polygon class="room" points="${points(outline)}"/>`);
    // Number and glyphs in the middle of the largest rectangle of both slab cuts, so an L, T or plus
    // keeps them inside its longest arm.
    const r = [...partition(outline), ...partition(outline, "rows")].reduce((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a));
    const c = px({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
    const marks = roomGlyphs(graph, id);
    marks.forEach((m) => usedGlyphs.add(m));
    map.push(`<text class="number" data-room="${esc(String(room.number))}" x="${c.x}" y="${c.y + (marks.length ? -1 : 7)}">${esc(String(room.number))}</text>`);
    const width = marks.length * glyphSize + (marks.length - 1) * 3;
    marks.forEach((m, i) => map.push(useGlyph(m, c.x - width / 2 + i * (glyphSize + 3), c.y + 3)));
  }

  // Doors between the same two rooms share a segment or a corridor: one mark, one tag for all their
  // gates; dashed and one-way only when every door of the group is (opposite one-ways cross both
  // ways). A corridor's tag and chevron sit at room a's end, a plain door at room b's.
  const groups = new Map<string, PlacedDoor[]>();
  for (const d of layout.doors) {
    const k = d.corridor ? corridorKey(d.corridor) : `${d.segment.from.x},${d.segment.from.y},${d.segment.to.x},${d.segment.to.y}`;
    if (groups.has(k)) groups.get(k)!.push(d);
    else groups.set(k, [d]);
  }
  const gates: { tag: string; gates: Gate[] }[] = [];
  for (const doors of groups.values()) {
    const tagged = doors.flatMap((d) => (d.door.gate && d.door.gate.kind !== "secret" ? [d.door.gate] : []));
    const secret = doors.every((d) => d.door.gate?.kind === "secret");
    const tag = tagged.length ? letter(gates.length) : undefined;
    if (tag) gates.push({ tag, gates: tagged });
    const [first] = doors as [PlacedDoor];
    const oneway = doors.every((d) => d.door.oneway && d.door.a === first.door.a);
    const corridorSide = (room: RoomId, s: Segment) => (first.corridor ? side(room, s) : undefined); // the corridor is past the room
    map.push(doorMark(first.segment, px, tag && tagged.map((g) => g.kind).join(" "), tag, secret, oneway ? side(first.door.a, first.segment) : undefined, corridorSide(first.door.a, first.segment)));
    if (first.corridor) map.push(doorMark(first.corridor.segment, px, undefined, undefined, secret, undefined, side(first.door.b, first.corridor.segment)));
  }

  // Key column: rooms by number, gates by tag, legend of what the map uses.
  const rooms = [...graph.rooms.values()].sort((a, b) => a.number - b.number);
  const gateLines = gates.map((g) => ({ tag: g.tag, text: g.gates.map(gateText).join("; ") }));
  const legend = [
    ...Object.keys(glyphs).filter((g) => usedGlyphs.has(g)).map((g) => ({ mark: useGlyph(g, 0, -11), text: glyphs[g]!.name })),
    ...(corridors.size ? [{ mark: `<rect class="corridor" x="0" y="-8" width="14" height="8"/>`, text: "corridor" }] : []),
    ...(gates.length ? [{ mark: `<rect class="tag" x="0" y="-11" width="14" height="14"/>`, text: "gate" }] : []),
    ...(layout.doors.some((d) => d.door.gate?.kind === "secret") ? [{ mark: `<line class="dash" x1="0" y1="-4" x2="14" y2="-4"/>`, text: "secret door" }] : []),
    ...(layout.doors.some((d) => d.door.oneway) ? [{ mark: `<polyline class="oneway" points="3,-8 7,-4 11,-8"/>`, text: "one-way" }] : []),
  ];
  const keyWidth = Math.max(200, 28 + charWidth * Math.max(...rooms.map((r) => r.label.length), ...gateLines.map((g) => g.text.length)));

  const kx = margin + mapWidth + gap;
  const key: string[] = [];
  let y = top;
  const heading = (text: string) => {
    key.push(`<text class="heading" x="${kx}" y="${y + 13}">${text}</text>`, `<line class="rule" x1="${kx}" y1="${y + 20}" x2="${kx + keyWidth}" y2="${y + 20}"/>`);
    y += 22 + line;
  };
  heading("rooms");
  for (const r of rooms) {
    const n = esc(String(r.number)); // number and gate kind are untyped at runtime, like the labels
    key.push(`<text class="muted" x="${kx}" y="${y}">${n}</text>`, `<text data-key="${n}" x="${kx + 28}" y="${y}">${esc(r.label)}</text>`);
    y += line;
  }
  if (gateLines.length) {
    y += line;
    heading("gates");
    for (const g of gateLines) {
      key.push(tagMark(kx + 7, y - 4, g.tag), `<text x="${kx + 28}" y="${y}">${esc(g.text)}</text>`);
      y += line;
    }
  }
  if (legend.length) {
    y += line;
    heading("legend");
    for (const l of legend) {
      key.push(`<g transform="translate(${kx},${y})">${l.mark}</g>`, `<text x="${kx + 28}" y="${y}">${l.text}</text>`);
      y += line;
    }
  }

  const title = meta.theme ?? "dungeon";
  const subtitle = [meta.size && `size ${meta.size}`, meta.seed !== undefined && `seed ${meta.seed}`, `layout ${meta.layoutSeed}`, meta.grammar]
    .filter(Boolean)
    .join(" · ");
  const width = Math.max(kx + keyWidth, margin + Math.max(title.length * titleCharWidth, subtitle.length * charWidth)) + margin;
  const height = Math.max(top + mapHeight, y) + margin;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    style,
    `<defs>${defs()}</defs>`,
    `<rect width="${width}" height="${height}" fill="#f6f8f7"/>`,
    `<text class="title" x="${margin}" y="${margin + 19}">${esc(title)}</text>`,
    `<text class="muted" x="${margin}" y="${margin + 40}">${esc(subtitle)}</text>`,
    ...map,
    ...key,
    `</svg>`,
  ].join("\n");
}

// JSON → SVG at a layout seed, titled from the JSON: the CLI and the viewer draw through this.
export function draw(json: DungeonJson, layoutSeed: number, config: LayoutConfig): { svg: string; rooms: number } {
  const { graph, layout } = generate(json, layoutSeed, config);
  const meta = { seed: isSeed(json.seed) ? json.seed : undefined, layoutSeed, theme: json.theme, size: json.size, grammar: json.grammar };
  return { svg: render(graph, layout, meta), rooms: graph.rooms.size };
}

const useGlyph = (id: string, x: number, y: number) =>
  `<use href="#glyph-${id}" class="glyph" x="${x}" y="${y}" width="${glyphSize}" height="${glyphSize}"/>`;

const tagMark = (x: number, y: number, tag: string, gate?: string) =>
  `<rect class="tag"${gate ? ` data-gate="${esc(gate)}"` : ""} x="${x - 7}" y="${y - 7}" width="14" height="14"/><text class="tag-letter" x="${x}" y="${y + 4}">${tag}</text>`;

// A gap of the door's length across the wall with a jamb at each end; secret doors dashed; a gate
// tag on the door; a one-way chevron pointing away from room a (past the tag when there is one).
// Into a corridor, the gap's corridor half is the corridor's grey.
function doorMark(
  s: Segment,
  px: (p: Point) => Point,
  gate: string | undefined,
  tag: string | undefined,
  secret: boolean,
  d: 1 | -1 | undefined, // one-way: +1 points down or right
  c?: 1 | -1, // corridor: +1 below or right of the door
): string {
  const a = px(s.from);
  const b = px(s.to);
  const horizontal = a.y === b.y;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const parts = horizontal
    ? [
        `<rect class="gap" x="${a.x + 1}" y="${a.y - 2}" width="${b.x - a.x - 2}" height="4"/>`,
        `<line class="jamb" x1="${a.x}" y1="${a.y - 3}" x2="${a.x}" y2="${a.y + 3}"/>`,
        `<line class="jamb" x1="${b.x}" y1="${b.y - 3}" x2="${b.x}" y2="${b.y + 3}"/>`,
      ]
    : [
        `<rect class="gap" x="${a.x - 2}" y="${a.y + 1}" width="4" height="${b.y - a.y - 2}"/>`,
        `<line class="jamb" x1="${a.x - 3}" y1="${a.y}" x2="${a.x + 3}" y2="${a.y}"/>`,
        `<line class="jamb" x1="${b.x - 3}" y1="${b.y}" x2="${b.x + 3}" y2="${b.y}"/>`,
      ];
  if (c) {
    const o = c > 0 ? 0.5 : -2; // past the wall's half-pixel stroke
    parts.push(
      horizontal
        ? `<rect class="gap-corridor" x="${a.x + 1}" y="${a.y + o}" width="${b.x - a.x - 2}" height="1.5"/>`
        : `<rect class="gap-corridor" x="${a.x + o}" y="${a.y + 1}" width="1.5" height="${b.y - a.y - 2}"/>`,
    );
  }
  if (secret) parts.push(`<line class="dash" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
  if (tag) parts.push(tagMark(mid.x, mid.y, tag, gate));
  if (d) {
    const o = tag ? 12 * d : 0;
    const pts = horizontal
      ? [[mid.x - 4, mid.y + o - 2 * d], [mid.x, mid.y + o + 2 * d], [mid.x + 4, mid.y + o - 2 * d]]
      : [[mid.x + o - 2 * d, mid.y - 4], [mid.x + o + 2 * d, mid.y], [mid.x + o - 2 * d, mid.y + 4]];
    parts.push(`<polyline class="oneway" points="${pts.map((p) => p.join(",")).join(" ")}"/>`);
  }
  return `<g class="door${tag ? " gated" : ""}${secret ? " secret" : ""}">${parts.join("")}</g>`;
}
