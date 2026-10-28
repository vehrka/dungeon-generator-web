import type { Point, Polygon, Segment } from "../engine/geometry";
import { hatch, hatchReach } from "./hatch";
import { chevron, roomMarks, tagMark, unit, type Painter } from "./marks";

// Dyson Logos look (docs/dyson-style.md): black ink on white, thick walls, hatched rock, a faint
// grid on the floors. Doors are plain gaps, secret doors an S on the wall, gate tags and one-way
// chevrons on the door as in the catalogue, until the door symbols land (STATUS step 3).
const ink = "#000000";
const paper = "#ffffff";
const grid = "#a9bcc6";
const wall = 3; // px
const serif = `'Palatino Linotype','Book Antiqua',Palatino,Georgia,'DejaVu Serif','Noto Serif',serif`; // resvg maps generic serif to Times

const css = `<style>
text{font-family:${serif};font-size:13px;fill:${ink}}
.hatch{fill:none;stroke:${ink};stroke-width:0.9;stroke-linecap:round}
.paper{fill:${paper};stroke:none}
.grid{fill:url(#grid);stroke:none}
.grid-line{fill:none;stroke:${grid};stroke-width:0.5}
.wall{fill:none;stroke:${ink};stroke-width:${wall};stroke-linejoin:miter}
.secret{font-size:13px;font-weight:bold;text-anchor:middle;stroke:${paper};stroke-width:3;paint-order:stroke}
.oneway{fill:none;stroke:${ink};stroke-width:1.5}
.muted{font-style:italic}
.number{font-size:17px;text-anchor:middle}
.glyph{fill:none;stroke:${ink};stroke-width:1.2}
.tag{fill:${paper};stroke:${ink};stroke-width:1}
.tag-letter{font-size:10px;text-anchor:middle}
.title{font-size:19px}
.heading{font-style:italic}
.rule{stroke:${ink};stroke-width:0.5}
</style>`;

const round = (v: number) => Math.round(v * 10) / 10;

// Paint order: hatching, floors white, floor grid, walls, door gaps (white, gridded), door marks,
// numbers and glyphs. Floors and gaps are groups drawn more than once, so fill, grid and wall share
// every point.
export const dyson: Painter = {
  css,
  page: paper,
  pad: Math.ceil(hatchReach),
  paint(s, px, layoutSeed) {
    const floors: Polygon[] = [...s.rooms.map((r) => r.outline), ...s.corridors];
    const points = (outline: Polygon) => outline.map((q) => px(q)).map((q) => `${q.x},${q.y}`).join(" ");
    const strokes = hatch(floors, layoutSeed).flatMap((c) => c.strokes);
    const d = strokes
      .map(({ from, to }) => {
        const [a, b] = [px(from), px(to)];
        return `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`;
      })
      .join("");
    // Grid lines through the middle of the pattern tile, which starts half a unit before a grid
    // point, so they fall on whole grid units and are not cut at the tile's edge.
    const o = px({ x: s.bbox.x0, y: s.bbox.y0 });
    const defs =
      `<pattern id="grid" patternUnits="userSpaceOnUse" x="${o.x - unit / 2}" y="${o.y - unit / 2}" width="${unit}" height="${unit}">` +
      `<path class="grid-line" d="M${unit / 2} 0V${unit}M0 ${unit / 2}H${unit}"/></pattern>` +
      `<g id="floors">${floors.map((f) => `<polygon class="floor" points="${points(f)}"/>`).join("")}</g>`;
    const ends = (door: (typeof s.doors)[number]) => [door.segment, ...(door.corridor ? [door.corridor.segment] : [])];
    const gaps = s.doors.filter((door) => !door.secret).flatMap(ends).map((g) => gapMark(g, px));
    // Tag and chevron at room a's end of a corridor, as in the catalogue.
    const marks = s.doors.flatMap((door) => {
      const [a, b] = [px(door.segment.from), px(door.segment.to)];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return [
        ...(door.secret ? ends(door).map((e) => secretMark(e, px)) : []),
        ...(door.tag ? [tagMark(mid.x, mid.y, door.tag, door.gates.map((g) => g.kind).join(" "))] : []),
        ...(door.oneway ? [chevron(mid, a.y === b.y, door.oneway, !!door.tag)] : []),
      ];
    });
    return {
      defs: defs + (gaps.length ? `<g id="gaps">${gaps.join("")}</g>` : ""),
      map: [
        `<path class="hatch" d="${d}"/>`,
        `<use href="#floors" class="paper"/>`,
        `<use href="#floors" class="grid"/>`,
        `<use href="#floors" class="wall"/>`,
        ...(gaps.length ? [`<use href="#gaps" class="paper"/>`, `<use href="#gaps" class="grid"/>`] : []),
        ...marks,
        ...s.rooms.flatMap((room) => roomMarks(room, px(room.anchor), 6)),
      ],
      legend: [
        ...(s.doors.some((door) => door.tag) ? [{ mark: tagMark(7, -4, ""), text: "gate" }] : []),
        ...(s.doors.some((door) => door.secret) ? [{ mark: `<text class="secret" x="7" y="0">S</text>`, text: "secret door" }] : []),
        ...(s.doors.some((door) => door.oneway) ? [{ mark: `<polyline class="oneway" points="3,-8 7,-4 11,-8"/>`, text: "one-way" }] : []),
      ],
    };
  },
};

// A secret door: the wall unbroken, an S across its middle.
function secretMark(s: Segment, px: (p: Point) => Point): string {
  const [a, b] = [px(s.from), px(s.to)];
  return `<text class="secret" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 + 4.5}">S</text>`;
}

// A plain opening: paper over the wall along the door, a pixel wider than the wall each side and
// half a wall short at each end, so a door flush with a corner leaves the other wall whole.
function gapMark(s: Segment, px: (p: Point) => Point): string {
  const [a, b] = [px(s.from), px(s.to)];
  const h = wall / 2 + 1;
  return a.y === b.y
    ? `<rect class="gap" x="${Math.min(a.x, b.x) + wall / 2}" y="${a.y - h}" width="${Math.abs(b.x - a.x) - wall}" height="${2 * h}"/>`
    : `<rect class="gap" x="${a.x - h}" y="${Math.min(a.y, b.y) + wall / 2}" width="${2 * h}" height="${Math.abs(b.y - a.y) - wall}"/>`;
}
