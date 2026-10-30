import type { Polygon } from "../engine/geometry";
import { doorMark, roomMarks, type Painter } from "./marks";
import type { Scene, SceneRoom } from "./scene";

// Neon look (docs/neon-style.md): an indigo-black page, dark corridors like streets, rooms as blocks
// in their role's colour with a glow from stacked strokes (no SVG filters), mono type. Doors as the
// plain style's gaps and jambs until the doors step; gate tags yellow on the page.
const page = "#0b0814";
const corridorFill = "#141a2a";
const corridorLine = "#2b3550";
const ink = "#eef2ff";
const muted = "#7d86a8";
const rule = "#232a40";
const gate = "#ffd23f";
const wall = 2; // px
const glow: [number, number][] = [[16, 0.1], [9, 0.22], [4, 0.45]]; // stroke px, opacity; widest first
const mono = `'DejaVu Sans Mono','Noto Sans Mono','Liberation Mono',Menlo,Consolas,monospace`; // resvg needs named fonts first

// Role → wall and glow colour, fill (the colour mixed into the page by the design's fill share).
const roles = {
  start: { colour: "#19e3ff", fill: "#0f4a5a" },
  goal: { colour: "#ff2bd6", fill: "#6d1662" },
  boss: { colour: "#ff3b4f", fill: "#541726" },
  pickup: { colour: "#ffa53a", fill: "#4f341f" },
  treasure: { colour: "#a66bff", fill: "#3a265a" },
  "other-0": { colour: "#1fbfa5", fill: "#0f292e" },
  "other-1": { colour: "#3d7bff", fill: "#141d3e" },
  "other-2": { colour: "#5b8aa6", fill: "#191f2e" },
};
export type Role = keyof typeof roles;
const legendRoles: Role[] = ["start", "goal", "boss", "pickup", "treasure"];
const pickups = ["key", "bosskey", "item", "switch", "lever"];

// docs/neon-style.md § Role colours: from the room type alone, start and goal by id first.
export function role(room: SceneRoom, s: Scene): Role {
  const t = room.type;
  if (room.id === s.start || t === "st" || t === "exit") return "start";
  if (room.id === s.goal || t === "gl") return "goal";
  if (t === "eb" || t === "em") return "boss";
  if (pickups.includes(t)) return "pickup";
  if (t.split(":")[0] === "gb") return "treasure"; // the family, as shapeRules and the scene's glyphs read it
  return `other-${Number.isInteger(room.number) ? ((room.number % 3) + 3) % 3 : 0}` as Role; // numbers are untyped at runtime, like the labels
}

// Role rules before the pass rules: a glow or wall's fill:none and a fill's stroke:none win.
const css = `<style>
text{font-family:${mono};font-size:12px;fill:${ink}}
.corridor{fill:${corridorFill};stroke:${corridorLine};stroke-width:1}
${Object.entries(roles).map(([r, c]) => `.r-${r}{fill:${c.fill};stroke:${c.colour}}`).join("\n")}
${glow.map(([w, o], i) => `.glow${i}{fill:none;stroke-width:${w};stroke-opacity:${o};stroke-linejoin:miter}`).join("\n")}
.fill{stroke:none}
.wall{fill:none;stroke-width:${wall};stroke-linejoin:miter}
.swatch{stroke-width:${wall}}
.number{font-size:17px;font-weight:bold;text-anchor:middle}
.gap,.gap-corridor{fill:${corridorFill}}
.jamb,.dash{stroke:${ink};stroke-width:1}
.dash{stroke-dasharray:2 2}
.oneway{fill:none;stroke:${ink};stroke-width:1.5}
.tag{fill:${page};stroke:${gate};stroke-width:1}
.tag-letter{font-size:10px;font-weight:bold;text-anchor:middle;fill:${gate}}
.glyph{fill:none;stroke:${ink};stroke-width:1}
.title{font-size:18px;font-weight:bold}
.muted{fill:${muted}}
.heading{font-weight:bold}
.rule{stroke:${rule};stroke-width:1}
</style>`;

// Paint order (docs/neon-style.md): every room's glows widest first, corridors (over the glows, so
// none crosses a doorway), fills (covering the glows' inner half and the neighbours' outer glow),
// walls, doors, numbers and glyphs. Each outline
// once in defs, its passes as <use>, the role class inherited.
export const neon: Painter = {
  css,
  page,
  pad: 1, // room for the widest glow, 8 px past the wall
  paint(s, px) {
    const points = (outline: Polygon) => outline.map((q) => px(q)).map((p) => `${p.x},${p.y}`).join(" ");
    const rooms = s.rooms.map((room, i) => ({ room, i, role: role(room, s) }));
    const use = (pass: string) => rooms.map(({ i, role }) => `<use href="#room-${i}" class="${pass} r-${role}"/>`);
    const doors = s.doors.flatMap((d) => [
      doorMark(d.segment, px, d.tag && d.gates.map((g) => g.kind).join(" "), d.tag, d.secret, d.oneway, d.corridor?.sideA),
      ...(d.corridor ? [doorMark(d.corridor.segment, px, undefined, undefined, d.secret, undefined, d.corridor.sideB)] : []),
    ]);
    const used = new Set(rooms.map((r) => r.role));
    return {
      defs: rooms.map(({ room, i }) => `<polygon id="room-${i}" points="${points(room.outline)}"/>`).join(""),
      map: [
        ...glow.flatMap((_, k) => use(`glow${k}`)),
        ...s.corridors.map((c) => `<polygon class="corridor" points="${points(c)}"/>`),
        ...use("fill"),
        ...use("wall"),
        ...doors,
        ...s.rooms.flatMap((room) => roomMarks(room, px(room.anchor), 6)),
      ],
      legend: [
        ...legendRoles.filter((r) => used.has(r)).map((r) => ({ mark: `<rect class="swatch r-${r}" x="1" y="-10" width="12" height="12"/>`, text: `${r} room` })),
        ...(s.corridors.length ? [{ mark: `<rect class="corridor" x="0" y="-8" width="14" height="8"/>`, text: "corridor" }] : []),
        ...(s.doors.some((d) => d.tag) ? [{ mark: `<rect class="tag" x="0" y="-11" width="14" height="14"/>`, text: "gate" }] : []),
        ...(s.doors.some((d) => d.secret) ? [{ mark: `<line class="dash" x1="0" y1="-4" x2="14" y2="-4"/>`, text: "secret door" }] : []),
        ...(s.doors.some((d) => d.oneway) ? [{ mark: `<polyline class="oneway" points="3,-8 7,-4 11,-8"/>`, text: "one-way" }] : []),
      ],
    };
  },
};
