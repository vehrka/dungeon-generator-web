import type { Point, Polygon, Segment } from "../engine/geometry";
import { hatch, hatchReach, wallShadow, wobble } from "./hatch";
import { chevron, roomMarks, tagMark, unit, type Painter } from "./marks";

// Dyson Logos look (docs/dyson-style.md): black ink on white, thick walls, hatched rock, a faint
// grid on the floors. Doors white rectangles across the wall, a bar for a lock, dots in a gap for a
// portcullis, an S on the wall for a secret door; archways at a corridor's room b end; boxed gate
// tags beside the door in room a, black one-way chevrons on room b's side.
const ink = "#000000";
const paper = "#ffffff";
const grid = "#a9bcc6";
const shadow = "#999999"; // Dyson's own grey, sampled from his maps
const wall = 3; // px
const light = (330 * Math.PI) / 180; // compass bearing of the light, NNW: top walls shade most, left walls less
const shadowLength = 0.35; // grid units the walls' shadow reaches away from the light
const wobbleAmp = 0.8 / unit; // grid units, 0.8 px: a gap or door still covers half a wall plus this
const serif = `'Palatino Linotype','Book Antiqua',Palatino,Georgia,'DejaVu Serif','Noto Serif',serif`; // resvg maps generic serif to Times

const css = `<style>
text{font-family:${serif};font-size:13px;fill:${ink}}
.hatch{fill:none;stroke:${ink};stroke-width:0.9;stroke-linecap:round}
.paper{fill:${paper};stroke:none}
.grid{fill:url(#grid);stroke:none}
.shadow{fill:${shadow};stroke:none}
.grid-line{fill:none;stroke:${grid};stroke-width:0.5}
.wall{fill:none;stroke:${ink};stroke-width:${wall};stroke-linejoin:miter}
.secret{font-size:13px;font-weight:bold;text-anchor:middle;stroke:${paper};stroke-width:3;paint-order:stroke}
.oneway{fill:none;stroke:${ink};stroke-width:1.5}
.door{fill:${paper};stroke:${ink};stroke-width:1.5}
.bar{stroke:${ink};stroke-width:1.5}
.dot{fill:${ink};stroke:none}
.muted{font-style:italic}
.number{font-size:17px;text-anchor:middle}
.glyph{fill:none;stroke:${ink};stroke-width:1.2}
.tag{fill:${paper};stroke:${ink};stroke-width:1}
.tag-letter{font-size:10px;text-anchor:middle}
.title{font-size:19px}
.heading{font-style:italic}
.rule{stroke:${ink};stroke-width:0.5}
</style>`;

const doorAcross = 8; // px, the door rectangle across the wall
const barLength = 12; // px, a lock's bar along the door's normal, past the rectangle
const dots = 3; // a portcullis's dots along the gap
const dotRadius = 1.5; // px

const round = (v: number) => Math.round(v * 10) / 10;

// Paint order: hatching, floors white, floor grid, wall shadow inside the floors (light from the
// upper left), walls, gaps (white, gridded: archways and portcullis), door symbols, then tags and
// chevrons (a tag beside one door can reach another's rectangle at a corner, so symbols first),
// numbers and glyphs. Floors (wobbled) and gaps (straight, on the door segment) are groups drawn
// more than once, so fill, grid and wall share every point.
export const dyson: Painter = {
  css,
  page: paper,
  pad: Math.ceil(hatchReach),
  paint(s, px, layoutSeed) {
    const floors: Polygon[] = [...s.rooms.map((r) => r.outline), ...s.corridors];
    const points = (outline: Polygon) => wobble(outline, layoutSeed, wobbleAmp).map((q) => px(q)).map((q) => `${round(q.x)},${round(q.y)}`).join(" ");
    const strokes = hatch(floors, layoutSeed).flatMap((c) => c.strokes);
    // Straight edges, under the wobbled wall: 1.5 px of half-wall covers 0.8 px of wobble. Doors open
    // the wall except a secret one, so a doorway casts none.
    const offset = { x: -Math.sin(light) * shadowLength, y: Math.cos(light) * shadowLength };
    const open = s.doors.filter((door) => door.symbol !== "secret").flatMap((door) => [door.segment, ...(door.corridor ? [door.corridor.segment] : [])]);
    const shade = floors
      .flatMap((f) => wallShadow(f, offset, open))
      .map((r) => {
        const [a, b] = [px({ x: r.x0, y: r.y0 }), px({ x: r.x1, y: r.y1 })];
        return `M${round(a.x)} ${round(a.y)}H${round(b.x)}V${round(b.y)}H${round(a.x)}Z`;
      })
      .join("");
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
    // Room a's end: the door symbol. A corridor's room b end: an archway, or an S for a secret door,
    // so the corridor does not give it away. Gaps only at archways and portcullis.
    const gaps = s.doors
      .flatMap((door) => [...(door.symbol === "portcullis" ? [door.segment] : []), ...(door.corridor && !door.secret ? [door.corridor.segment] : [])])
      .map((g) => wallRect(g, px, wall / 2 + 1, "gap"));
    const symbols = s.doors.flatMap((door) => {
      switch (door.symbol) {
        case "secret":
          return [door.segment, ...(door.corridor ? [door.corridor.segment] : [])].map((e) => secretMark(e, px));
        case "door":
          return [wallRect(door.segment, px, doorAcross / 2, "door")];
        case "lock":
          return [wallRect(door.segment, px, doorAcross / 2, "door"), barMark(door.segment, px)];
        case "portcullis":
          return dotMarks(door.segment, px);
      }
    });
    // Tags and chevrons over every symbol: a tag beside one door can reach another's at a corner.
    const marks = s.doors.flatMap((door) => {
      const horizontal = door.segment.from.y === door.segment.to.y;
      const at = (p: Point) => ({ x: round(px(p).x), y: round(px(p).y) });
      return [
        ...(door.tagAt ? [tagMark(at(door.tagAt).x, at(door.tagAt).y, door.tag!, door.gates.map((g) => g.kind).join(" "))] : []),
        ...(door.onewayAt ? [chevron(at(door.onewayAt), horizontal, door.oneway!, false)] : []),
      ];
    });
    const drawn = (symbol: string) => s.doors.some((door) => door.symbol === symbol);
    // Legend symbols through the map's own marks, on a 14 px door half a wall past each end.
    const sample: Segment = { from: { x: -wall / 2, y: -4 }, to: { x: 14 + wall / 2, y: -4 } };
    const same = (p: Point) => p;
    return {
      defs: defs + (gaps.length ? `<g id="gaps">${gaps.join("")}</g>` : ""),
      map: [
        `<path class="hatch" d="${d}"/>`,
        `<use href="#floors" class="paper"/>`,
        `<use href="#floors" class="grid"/>`,
        `<path class="shadow" d="${shade}"/>`,
        `<use href="#floors" class="wall"/>`,
        ...(gaps.length ? [`<use href="#gaps" class="paper"/>`, `<use href="#gaps" class="grid"/>`] : []),
        ...symbols,
        ...marks,
        ...s.rooms.flatMap((room) => roomMarks(room, px(room.anchor), 6)),
      ],
      legend: [
        ...(drawn("door") ? [{ mark: wallRect(sample, same, doorAcross / 2, "door"), text: "door" }] : []),
        ...(drawn("lock") ? [{ mark: wallRect(sample, same, doorAcross / 2, "door") + barMark(sample, same), text: "locked door" }] : []),
        ...(drawn("portcullis") ? [{ mark: `<path class="wall" d="M0 -4H2M12 -4H14"/>${dotMarks({ from: { x: 0, y: -4 }, to: { x: 14, y: -4 } }, same).join("")}`, text: "portcullis" }] : []),
        ...(drawn("secret") ? [{ mark: `<text class="secret" x="7" y="0">S</text>`, text: "secret door" }] : []),
        ...(s.doors.some((door) => door.onewayAt) ? [{ mark: `<polyline class="oneway" points="3,-8 7,-4 11,-8"/>`, text: "one-way" }] : []),
        ...(s.doors.some((door) => door.tagAt) ? [{ mark: tagMark(7, -4, ""), text: "gate" }] : []),
      ],
    };
  },
};

// A secret door: the wall unbroken, an S across its middle.
function secretMark(s: Segment, px: (p: Point) => Point): string {
  const [a, b] = [px(s.from), px(s.to)];
  return `<text class="secret" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 + 4.5}">S</text>`;
}

// A rectangle over the wall along the door, h px each side of it and half a wall short at each end,
// so a door flush with a corner leaves the other wall whole: a gap (paper, a pixel wider than the
// wall) or a door.
function wallRect(s: Segment, px: (p: Point) => Point, h: number, cls: string): string {
  const [a, b] = [px(s.from), px(s.to)];
  const r = a.y === b.y
    ? { x: Math.min(a.x, b.x) + wall / 2, y: a.y - h, w: Math.abs(b.x - a.x) - wall, h: 2 * h }
    : { x: a.x - h, y: Math.min(a.y, b.y) + wall / 2, w: 2 * h, h: Math.abs(b.y - a.y) - wall };
  return `<rect class="${cls}" x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}"/>`;
}

// A lock: a bar across the door rectangle's middle, along the normal.
function barMark(s: Segment, px: (p: Point) => Point): string {
  const [a, b] = [px(s.from), px(s.to)];
  const m = { x: round((a.x + b.x) / 2), y: round((a.y + b.y) / 2) };
  const h = barLength / 2;
  return a.y === b.y
    ? `<line class="bar" x1="${m.x}" y1="${m.y - h}" x2="${m.x}" y2="${m.y + h}"/>`
    : `<line class="bar" x1="${m.x - h}" y1="${m.y}" x2="${m.x + h}" y2="${m.y}"/>`;
}

// A portcullis: dots evenly along the gap, on the wall line.
function dotMarks(s: Segment, px: (p: Point) => Point): string[] {
  const [a, b] = [px(s.from), px(s.to)];
  return Array.from({ length: dots }, (_, i) => {
    const f = (i + 1) / (dots + 1);
    return `<circle class="dot" cx="${round(a.x + (b.x - a.x) * f)}" cy="${round(a.y + (b.y - a.y) * f)}" r="${dotRadius}"/>`;
  });
}
