import type { Point } from "../engine/geometry";
import { glyphSize } from "./icons";
import type { Scene, SceneRoom } from "./scene";

// Marks shared by the painters (plain in svg.ts, Dyson in dyson.ts); their look is in each
// style's CSS. Own module so dyson.ts and svg.ts do not import each other.
export type LegendEntry = { mark: string; text: string };
export type Painted = { defs: string; map: string[]; legend: LegendEntry[] };
// A map style: its stylesheet, page colour, room around the map in grid units, and the map itself
// painted from the scene through px (grid → page).
export type Painter = { css: string; page: string; pad: number; paint: (s: Scene, px: (p: Point) => Point, layoutSeed: number) => Painted };

export const unit = 24; // px per grid unit, both styles
export const tagBox = 14; // px, a gate tag's square; scene.ts keeps tags this far apart

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const useGlyph = (id: string, x: number, y: number) =>
  `<use href="#glyph-${id}" class="glyph" x="${x}" y="${y}" width="${glyphSize}" height="${glyphSize}"/>`;

export const tagMark = (x: number, y: number, tag: string, gate?: string) =>
  `<rect class="tag"${gate ? ` data-gate="${esc(gate)}"` : ""} x="${x - tagBox / 2}" y="${y - tagBox / 2}" width="${tagBox}" height="${tagBox}"/><text class="tag-letter" x="${x}" y="${y + 4}">${tag}</text>`;

// One-way chevron at a door's middle m, pointing away from room a (d +1: down or right), past the
// gate tag when there is one.
export function chevron(m: Point, horizontal: boolean, d: 1 | -1, tag: boolean): string {
  const o = tag ? 12 * d : 0;
  const pts = horizontal
    ? [[m.x - 4, m.y + o - 2 * d], [m.x, m.y + o + 2 * d], [m.x + 4, m.y + o - 2 * d]]
    : [[m.x + o - 2 * d, m.y - 4], [m.x + o + 2 * d, m.y], [m.x + o - 2 * d, m.y + 4]];
  return `<polyline class="oneway" points="${pts.map((p) => p.join(",")).join(" ")}"/>`;
}

// Room number at the anchor c, a row of glyphs under it; dy lowers a number without glyphs to the
// middle (font-size dependent).
export function roomMarks(room: SceneRoom, c: Point, dy: number): string[] {
  const n = esc(String(room.number));
  const width = room.glyphs.length * glyphSize + (room.glyphs.length - 1) * 3;
  return [
    `<text class="number" data-room="${n}" x="${c.x}" y="${c.y + (room.glyphs.length ? -1 : dy)}">${n}</text>`,
    ...room.glyphs.map((m, i) => useGlyph(m, c.x - width / 2 + i * (glyphSize + 3), c.y + 3)),
  ];
}
