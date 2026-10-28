import type { LayoutConfig } from "../engine/config";
import type { Point, Polygon, Segment } from "../engine/geometry";
import { generate } from "../engine/index";
import type { Layout } from "../engine/layout";
import { isSeed } from "../engine/rng";
import type { DungeonJson, Gate, RoomGraph } from "../engine/types";
import { dyson } from "./dyson";
import { defs, glyphs } from "./icons";
import { esc, roomMarks, tagMark, unit, useGlyph, type Painter } from "./marks";
import { scene } from "./scene";

export type MapStyle = "catalogue" | "dyson";
export const mapStyles: MapStyle[] = ["catalogue", "dyson"];
export type RenderMeta = { seed?: number; layoutSeed: number; theme?: string; size?: string; grammar?: string; style?: MapStyle };

// Cyber keeps the catalogue look; every other theme, or none (a loaded JSON may lack one), is Dyson
// (docs/dyson-style.md, style selection).
export const styleFor = (theme?: string): MapStyle => (theme === "cyber" ? "catalogue" : "dyson");

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

// The catalogue painter: rooms white, corridors grey, doors as gaps with jambs, amber gate tags.
const catalogue: Painter = {
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

const painters: Record<MapStyle, Painter> = { catalogue, dyson };

// Graph + layout → standalone SVG: map on the left, key column (rooms, gates, legend) on the right,
// in the style of meta.style (catalogue when absent).
export function render(graph: RoomGraph, layout: Layout, meta: RenderMeta): string {
  const painter = painters[meta.style ?? "catalogue"];
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
