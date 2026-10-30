import type { LayoutConfig } from "../engine/config";
import type { Point, Polygon } from "../engine/geometry";
import { generate } from "../engine/index";
import type { Layout } from "../engine/layout";
import { isSeed } from "../engine/rng";
import type { DungeonJson, Gate, Room, RoomGraph } from "../engine/types";
import { dyson } from "./dyson";
import { defs, glyphs } from "./icons";
import { doorMark, esc, roomMarks, tagMark, unit, useGlyph, type LegendEntry, type Painter } from "./marks";
import { neon } from "./neon";
import { scene } from "./scene";

export type MapStyle = "plain" | "dyson" | "neon";
export const mapStyles: MapStyle[] = ["plain", "dyson", "neon"];
export type RenderMeta = { seed?: number; layoutSeed: number; theme?: string; size?: string; grammar?: string; style?: MapStyle };

// Cyber is neon, zelda Dyson; any other theme, or none (a loaded JSON may lack one), plain
// (docs/design.md §7).
export const styleFor = (theme?: string): MapStyle => {
  const t = theme?.toLowerCase();
  return t === "cyber" ? "neon" : t === "zelda" ? "dyson" : "plain";
};

// Teenage engineering style (ref/webdesign/design.md): neutrals, hairlines, weight 100/300, no
// radius or shadow. Amber is the one chromatic note, kept for gates (docs/plans/09-render-cli.md).
export const margin = 33;
export const gap = 66;
export const titleHeight = 66;
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

const gateText = (g: Gate) => [g.kind, g.requires.map((o) => o.name).join(", ")].filter(Boolean).join("  ");

// The plain painter: rooms white, corridors grey, doors as gaps with jambs, amber gate tags.
export const plain: Painter = {
  css: style,
  page: "#f6f8f7",
  pad: 0,
  paint(s, px) {
    const points = (outline: Polygon) => outline.map((q) => `${px(q).x},${px(q).y}`).join(" ");
    const map: string[] = s.corridors.map((c) => `<polygon class="corridor" points="${points(c)}"/>`);
    for (const room of s.rooms) map.push(`<polygon class="room" points="${points(room.outline)}"/>`, ...roomMarks(room, px(room.anchor), 7));
    // One mark per door group. A corridor's tag and chevron sit at room a's end, a plain door at room b's.
    for (const d of s.doors) {
      map.push(doorMark(d.segment, px, d.tag && d.gates.map((g) => g.kind).join(" "), d.tag, d.secret, d.oneway, d.corridor?.sideA));
      if (d.corridor) map.push(doorMark(d.corridor.segment, px, undefined, undefined, d.secret, undefined, d.corridor.sideB));
    }
    // Secret and one-way as drawn: a group is only when all its doors are.
    const legend = [
      ...(s.corridors.length ? [{ mark: `<rect class="corridor" x="0" y="-8" width="14" height="8"/>`, text: "corridor" }] : []),
      ...(s.doors.some((d) => d.tag) ? [{ mark: `<rect class="tag" x="0" y="-11" width="14" height="14"/>`, text: "gate" }] : []),
      ...(s.doors.some((d) => d.secret) ? [{ mark: `<line class="dash" x1="0" y1="-4" x2="14" y2="-4"/>`, text: "secret door" }] : []),
      ...(s.doors.some((d) => d.oneway) ? [{ mark: `<polyline class="oneway" points="3,-8 7,-4 11,-8"/>`, text: "one-way" }] : []),
    ];
    return { defs: "", map, legend };
  },
};

const painters: Record<MapStyle, Painter> = { plain, dyson, neon };

// Graph + layout → standalone SVG: map on the left, key column (rooms, gates, legend) on the right,
// in the style of meta.style (plain when absent).
export function render(graph: RoomGraph, layout: Layout, meta: RenderMeta): string {
  const painter = painters[meta.style ?? "plain"];
  const s = scene(graph, layout);
  const { bbox } = s;
  const pad = painter.pad * unit;
  const mapWidth = (bbox.x1 - bbox.x0) * unit + 2 * pad;
  const mapHeight = (bbox.y1 - bbox.y0) * unit + 2 * pad;
  const top = margin + titleHeight;
  const px = (p: Point) => ({ x: margin + pad + (p.x - bbox.x0) * unit, y: top + pad + (p.y - bbox.y0) * unit });
  const painted = painter.paint(s, px, meta.layoutSeed);

  const gateLines = s.doors.flatMap((d) => (d.tag ? [{ tag: d.tag, gates: d.gates }] : []));
  const legend = [...glyphLegend(s.rooms.flatMap((r) => r.glyphs)), ...painted.legend];
  const k = keyColumn([...graph.rooms.values()], gateLines, legend, margin + mapWidth + gap, top);
  const t = titleBlock(meta, `layout ${meta.layoutSeed}`);
  const width = Math.max(k.x1, t.x1) + margin;
  const height = Math.max(top + mapHeight, k.y1) + margin;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    painter.css,
    `<defs>${defs()}${painted.defs}</defs>`,
    `<rect width="${width}" height="${height}" fill="${painter.page}"/>`,
    ...t.marks,
    ...painted.map,
    ...k.marks,
    `</svg>`,
  ].join("\n");
}

export type GateLine = { tag: string; gates: Gate[] };

// Legend entries for the glyphs drawn, in the glyph table's order.
const glyphLegend = (used: string[]): LegendEntry[] =>
  Object.keys(glyphs).filter((g) => used.includes(g)).map((g) => ({ mark: useGlyph(g, 0, -11), text: glyphs[g]!.name }));

// Key column at (x, y), shared by the map and the graph: rooms by number, gates by tag, legend of
// what the sheet draws. Returns its marks and right and bottom edges.
export function keyColumn(rooms: Room[], gateLines: GateLine[], legend: LegendEntry[], x: number, y: number): { marks: string[]; x1: number; y1: number } {
  rooms = [...rooms].sort((a, b) => a.number - b.number);
  const gateTexts = gateLines.map((g) => ({ tag: g.tag, text: g.gates.map(gateText).join("; ") }));
  const keyWidth = Math.max(200, 28 + charWidth * Math.max(...rooms.map((r) => r.label.length), ...gateTexts.map((g) => g.text.length), ...legend.map((l) => l.text.length)));
  const key: string[] = [];
  const heading = (text: string) => {
    key.push(`<text class="heading" x="${x}" y="${y + 13}">${text}</text>`, `<line class="rule" x1="${x}" y1="${y + 20}" x2="${x + keyWidth}" y2="${y + 20}"/>`);
    y += 22 + line;
  };
  heading("rooms");
  for (const r of rooms) {
    const n = esc(String(r.number)); // number and gate kind are untyped at runtime, like the labels
    key.push(`<text class="muted" x="${x}" y="${y}">${n}</text>`, `<text data-key="${n}" x="${x + 28}" y="${y}">${esc(r.label)}</text>`);
    y += line;
  }
  if (gateTexts.length) {
    y += line;
    heading("gates");
    for (const g of gateTexts) {
      key.push(tagMark(x + 7, y - 4, g.tag), `<text x="${x + 28}" y="${y}">${esc(g.text)}</text>`);
      y += line;
    }
  }
  if (legend.length) {
    y += line;
    heading("legend");
    for (const l of legend) {
      key.push(`<g transform="translate(${x},${y})">${l.mark}</g>`, `<text x="${x + 28}" y="${y}">${l.text}</text>`);
      y += line;
    }
  }
  return { marks: key, x1: x + keyWidth, y1: y };
}

// Title and subtitle at the top left: theme, then size, dungeon seed, what drew the sheet (layout
// seed, or graph) and grammar. Returns its marks and right edge.
export function titleBlock(meta: Omit<RenderMeta, "layoutSeed" | "style">, drawnBy: string): { marks: string[]; x1: number } {
  const title = meta.theme ?? "dungeon";
  const subtitle = [meta.size && `size ${meta.size}`, meta.seed !== undefined && `seed ${meta.seed}`, drawnBy, meta.grammar].filter(Boolean).join(" · ");
  return {
    marks: [`<text class="title" x="${margin}" y="${margin + 19}">${esc(title)}</text>`, `<text class="muted" x="${margin}" y="${margin + 40}">${esc(subtitle)}</text>`],
    x1: margin + Math.max(title.length * titleCharWidth, subtitle.length * charWidth),
  };
}

// JSON → SVG at a layout seed, titled from the JSON: the CLI and the viewer draw through this.
export function draw(json: DungeonJson, layoutSeed: number, config: LayoutConfig, style = styleFor(json.theme)): { svg: string; rooms: number } {
  const { graph, layout } = generate(json, layoutSeed, config);
  const meta = { seed: isSeed(json.seed) ? json.seed : undefined, layoutSeed, theme: json.theme, size: json.size, grammar: json.grammar, style };
  return { svg: render(graph, layout, meta), rooms: graph.rooms.size };
}
