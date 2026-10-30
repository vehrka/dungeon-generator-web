import type { LayoutConfig } from "../engine/config";
import type { Point, Polygon } from "../engine/geometry";
import { generate } from "../engine/index";
import type { Layout } from "../engine/layout";
import { isSeed } from "../engine/rng";
import type { DungeonJson, Gate, RoomGraph } from "../engine/types";
import { dyson } from "./dyson";
import { defs, glyphs } from "./icons";
import { doorMark, esc, roomMarks, tagMark, unit, useGlyph, type Painter } from "./marks";
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

const gateText = (g: Gate) => [g.kind, g.requires.map((o) => o.name).join(", ")].filter(Boolean).join("  ");

// The plain painter: rooms white, corridors grey, doors as gaps with jambs, amber gate tags.
const plain: Painter = {
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

  // Key column: rooms by number, gates by tag, legend of what the map uses.
  const rooms = [...graph.rooms.values()].sort((a, b) => a.number - b.number);
  const gateLines = s.doors.flatMap((d) => (d.tag ? [{ tag: d.tag, text: d.gates.map(gateText).join("; ") }] : []));
  const usedGlyphs = new Set(s.rooms.flatMap((r) => r.glyphs));
  const legend = [
    ...Object.keys(glyphs).filter((g) => usedGlyphs.has(g)).map((g) => ({ mark: useGlyph(g, 0, -11), text: glyphs[g]!.name })),
    ...painted.legend,
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
    painter.css,
    `<defs>${defs()}${painted.defs}</defs>`,
    `<rect width="${width}" height="${height}" fill="${painter.page}"/>`,
    `<text class="title" x="${margin}" y="${margin + 19}">${esc(title)}</text>`,
    `<text class="muted" x="${margin}" y="${margin + 40}">${esc(subtitle)}</text>`,
    ...painted.map,
    ...key,
    `</svg>`,
  ].join("\n");
}

// JSON → SVG at a layout seed, titled from the JSON: the CLI and the viewer draw through this.
export function draw(json: DungeonJson, layoutSeed: number, config: LayoutConfig, style = styleFor(json.theme)): { svg: string; rooms: number } {
  const { graph, layout } = generate(json, layoutSeed, config);
  const meta = { seed: isSeed(json.seed) ? json.seed : undefined, layoutSeed, theme: json.theme, size: json.size, grammar: json.grammar, style };
  return { svg: render(graph, layout, meta), rooms: graph.rooms.size };
}
