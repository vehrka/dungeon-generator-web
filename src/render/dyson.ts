import type { Point, Polygon, Segment } from "../engine/geometry";
import { hatch, hatchDepth } from "./hatch";
import { roomMarks, unit, type Painter } from "./marks";

// Dyson Logos look (docs/dyson-style.md): black ink on white, thick walls, hatched rock, a faint
// grid on the floors. Doors are plain gaps until the door symbols land (STATUS step 3).
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
.gap{fill:${paper}}
.number{font-size:17px;text-anchor:middle}
.glyph{fill:none;stroke:${ink};stroke-width:1.2}
.tag{fill:${paper};stroke:${ink};stroke-width:1}
.tag-letter{font-size:10px;text-anchor:middle}
.title{font-size:19px}
.heading{font-style:italic}
.rule{stroke:${ink};stroke-width:0.5}
</style>`;

const round = (v: number) => Math.round(v * 10) / 10;

// Paint order: hatching, floors white, floor grid, walls, door gaps, numbers and glyphs. The floors
// are one group drawn three times, so fill, grid and wall share every point.
export const dyson: Painter = {
  css,
  page: paper,
  pad: Math.ceil(hatchDepth + 0.5), // hatching plus the half stroke poking past it
  paint(s, px, layoutSeed) {
    const floors: Polygon[] = [...s.rooms.map((r) => r.outline), ...s.corridors];
    const points = (outline: Polygon) => outline.map((q) => `${px(q).x},${px(q).y}`).join(" ");
    const strokes = hatch(floors, layoutSeed).flatMap((c) => c.strokes);
    const d = strokes.map(({ from, to }) => `M${round(px(from).x)} ${round(px(from).y)}L${round(px(to).x)} ${round(px(to).y)}`).join("");
    // Grid lines through the middle of the pattern tile, which starts half a unit before a grid
    // point, so they fall on whole grid units and are not cut at the tile's edge.
    const o = px({ x: s.bbox.x0, y: s.bbox.y0 });
    const defs =
      `<pattern id="grid" patternUnits="userSpaceOnUse" x="${o.x - unit / 2}" y="${o.y - unit / 2}" width="${unit}" height="${unit}">` +
      `<path class="grid-line" d="M${unit / 2} 0V${unit}M0 ${unit / 2}H${unit}"/></pattern>` +
      `<g id="floors">${floors.map((f) => `<polygon class="floor" points="${points(f)}"/>`).join("")}</g>`;
    const gaps = s.doors.flatMap((door) => [door.segment, ...(door.corridor ? [door.corridor.segment] : [])]).map((g) => gapMark(g, px));
    return {
      defs,
      map: [
        `<path class="hatch" d="${d}"/>`,
        `<use href="#floors" class="paper"/>`,
        `<use href="#floors" class="grid"/>`,
        `<use href="#floors" class="wall"/>`,
        ...gaps,
        ...s.rooms.flatMap((room) => roomMarks(room, px(room.anchor), 6)),
      ],
      legend: [],
    };
  },
};

// A plain opening: paper over the wall along the door, a pixel wider than the wall each side and
// half a wall short at each end, so a door flush with a corner leaves the other wall whole.
function gapMark(s: Segment, px: (p: Point) => Point): string {
  const [a, b] = [px(s.from), px(s.to)];
  const h = wall / 2 + 1;
  return a.y === b.y
    ? `<rect class="gap" x="${Math.min(a.x, b.x) + wall / 2}" y="${a.y - h}" width="${Math.abs(b.x - a.x) - wall}" height="${2 * h}"/>`
    : `<rect class="gap" x="${a.x - h}" y="${Math.min(a.y, b.y) + wall / 2}" width="${2 * h}" height="${Math.abs(b.y - a.y) - wall}"/>`;
}
