import type { Point, Segment } from "../engine/geometry";
import { glyphSize } from "./icons";
import type { Scene, SceneRoom } from "./scene";

// Marks shared by the painters (plain in svg.ts, Dyson in dyson.ts, neon in neon.ts); their look
// is in each style's CSS. Own module so the painters and svg.ts do not import each other.
export type LegendEntry = { mark: string; text: string };
export type Painted = { defs: string; map: string[]; legend: LegendEntry[] };
// A map style: its stylesheet, page colour, room around the map in grid units, and the map itself
// painted from the scene through px (grid → page).
export type Painter = { css: string; page: string; pad: number; paint: (s: Scene, px: (p: Point) => Point, layoutSeed: number) => Painted };

export const unit = 24; // px per grid unit, both styles
export const tagBox = 14; // px, a gate tag's square; scene.ts keeps tags this far apart

const barLength = 12; // px, a lock's bar along the door's normal, past the rectangle
const dots = 3; // a portcullis's dots along the gap
const dotRadius = 1.5; // px

export const round = (v: number) => Math.round(v * 10) / 10;

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

// A gap of the door's length across the wall with a jamb at each end; secret doors dashed; a gate
// tag on the door; a one-way chevron pointing away from room a (past the tag when there is one).
// Into a corridor, the gap's corridor half is the corridor's grey.
export function doorMark(
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
  if (d) parts.push(chevron(mid, horizontal, d, !!tag));
  return `<g class="door${tag ? " gated" : ""}${secret ? " secret" : ""}">${parts.join("")}</g>`;
}

// Door symbols of the Dyson and neon styles, wall their wall width in px.

// A secret door: the wall unbroken, an S across its middle.
export function secretMark(s: Segment, px: (p: Point) => Point): string {
  const [a, b] = [px(s.from), px(s.to)];
  return `<text class="secret" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 + 4.5}">S</text>`;
}

// A rectangle over the wall along the door, h px each side of it and half a wall short at each end,
// so a door flush with a corner leaves the other wall whole: a gap (a pixel wider than the wall) or
// a door.
export function wallRect(s: Segment, px: (p: Point) => Point, h: number, cls: string, wall: number): string {
  const [a, b] = [px(s.from), px(s.to)];
  const r = a.y === b.y
    ? { x: Math.min(a.x, b.x) + wall / 2, y: a.y - h, w: Math.abs(b.x - a.x) - wall, h: 2 * h }
    : { x: a.x - h, y: Math.min(a.y, b.y) + wall / 2, w: 2 * h, h: Math.abs(b.y - a.y) - wall };
  return `<rect class="${cls}" x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}"/>`;
}

// A lock: a bar across the door rectangle's middle, along the normal.
export function barMark(s: Segment, px: (p: Point) => Point): string {
  const [a, b] = [px(s.from), px(s.to)];
  const m = { x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2) };
  const h = barLength / 2;
  return a.y === b.y
    ? `<line class="bar" x1="${m.x}" y1="${m.y - h}" x2="${m.x}" y2="${m.y + h}"/>`
    : `<line class="bar" x1="${m.x - h}" y1="${m.y}" x2="${m.x + h}" y2="${m.y}"/>`;
}

// A portcullis: dots evenly along the gap, on the wall line.
export function dotMarks(s: Segment, px: (p: Point) => Point): string[] {
  const [a, b] = [px(s.from), px(s.to)];
  return Array.from({ length: dots }, (_, i) => {
    const f = (i + 1) / (dots + 1);
    return `<circle class="dot" cx="${round(a.x + (b.x - a.x) * f)}" cy="${round(a.y + (b.y - a.y) * f)}" r="${dotRadius}"/>`;
  });
}
