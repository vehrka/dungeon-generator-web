import type { Point, Rect } from "../engine/geometry";
import { normalize } from "../engine/normalize";
import { isSeed } from "../engine/rng";
import type { Door, DungeonJson, Gate, RoomGraph, RoomId } from "../engine/types";
import { esc, round } from "./marks";
import { gap, keyColumn, margin, plain, titleBlock, titleHeight, type TitleMeta } from "./svg";

// The dungeon's room graph as a layered drawing (docs/design.md § Graph view): no planarity, no
// layout, no seed, so it also draws a dungeon that fails to lay out. Sugiyama-lite, deterministic.
// Look after the Python generator's Graphviz plot (utils/dungeon_render.py, dot_utils.py): top to
// bottom, rooms coloured by type, pickups and switches as their own shapes, gates as coloured
// labelled edges.
export type Shape = "room" | "special" | "item" | "switch";
// A box's look: the number goes before the label when present (the graph view numbers rooms, the
// grammar sheet does not); fill is the room shape's, the other shapes fill by class.
export type Look = { shape: Shape; code: string; label: string; fill: string; colour: string; number?: string };
export type GraphBox = Look & { id: RoomId; layer: number; x: number; y: number; w: number; h: number };
export type EdgeKind = "both" | "one" | "lock" | "state" | "on" | "off" | "secret";
export type GraphEdge = {
  a: RoomId; // the end first in (layer, position)
  b: RoomId;
  from: Point; // on a's box
  to: Point; // on b's box
  ctrl?: Point; // a quadratic curve's control point; straight when absent
  gates: Gate[]; // the pair's gates but secret
  kind: EdgeKind;
  label?: string; // the objects the gates need, [bronze key 1]
  secret: boolean;
  towards?: RoomId; // one-way: the room it leads to
  labelX?: number; // across: the label's x, the middle of the gap after a's layer
};
export type GraphLayout = { layers: RoomId[][]; boxes: Map<RoomId, GraphBox>; edges: GraphEdge[]; bbox: Rect; across: boolean };
// across: layers left to right (the grammar sheet's variants, Python's rankdir=LR), else top to
// bottom. look: a box's look, the room's by its type when absent.
export type GraphOptions = { across?: boolean; look?: (id: RoomId) => Look };

const sweeps = 8; // barycenter sweeps, each down then up
const boxHeight = 26;
const charWidth = 6.8; // rough width of a 12 px character, sizes the boxes
const labelCharWidth = 5.8; // the same at 10 px, edge labels
const boxPad = 10; // px, text to box side
const roundPad = 18; // px, text to an ellipse's or hexagon's side
const colGap = 22; // px between boxes in a row
const rowGap = 64; // px between rows
const acrossGap = 36; // px between layers across, unless labels need more
const step = 16; // px, the control point's sideways step while a curve that skips rows looks for a way past
const clearance = 4; // px, a curve that skips rows stays this far off every box
const labelGap = 8; // px, across: an edge label to the boxes either side

// Room type (before any ':'): fill, font colour, legend text; the Python plot's ROOM_STYLE.
const roomStyle: Record<string, [string, string, string]> = {
  n: ["#e3e6ea", "#000", "nothing / explore"],
  e: ["#f4b6a6", "#000", "enemy"],
  m: ["#f4b6a6", "#000", "monster"],
  em: ["#e8735a", "#000", "mini-boss"],
  eb: ["#a93226", "#fff", "boss"],
  t: ["#f5c07a", "#000", "trap"],
  p: ["#b8a9e3", "#000", "puzzle"],
  c: ["#d7c49e", "#000", "challenge (skill check)"],
  gb: ["#a8dba8", "#000", "bonus goal"],
};
const roomFallback: [string, string, string] = ["#fff", "#000", "room"];
export const special = "#f0d24a";
export const pickup = "#56b4e9";
export const switchFill = "#e39ac8";
export const page = "#eef0f3";
export const edgeColour: Record<EdgeKind, string> = { both: "#555", one: "#111", lock: "#c0601a", state: "#b34d8f", on: "#b34d8f", off: "#b34d8f", secret: "#888" };
const pickupTypes = new Set(["item", "key", "bosskey"]);
const switchTypes = new Set(["switch", "lever"]);

const typeCode = (type: string) => String(type).split(":")[0]!;

// Look of a room: START and GOAL by name, pickups as Get and the objects, switches by their
// objects, any other room by its type, coloured by it.
function node(graph: RoomGraph, id: RoomId): Look {
  const room = graph.rooms.get(id)!;
  const code = typeCode(room.type);
  const number = String(room.number);
  const names = room.objects.map((o) => o.name).join(", ");
  if (id === graph.start || id === graph.goal) return { shape: "special", code, label: id === graph.start ? "START" : "GOAL", fill: special, colour: "#000", number };
  if (pickupTypes.has(code)) return { shape: "item", code, label: names ? `Get ${names}` : String(room.type), fill: pickup, colour: "#000", number };
  if (switchTypes.has(code)) return { shape: "switch", code, label: names || String(room.type), fill: switchFill, colour: "#000", number };
  const [fill, colour] = roomStyle[code] ?? roomFallback;
  return { shape: "room", code, label: String(room.type), fill, colour, number };
}

const boxText = (b: Look) => (b.number === undefined ? b.label : `${b.number} ${b.label}`);

// Edge kind of a room pair: a lock wins, then the first other gate, then secret, one-way, two-way.
function edgeKind(gates: Gate[], secret: boolean, oneway: boolean): EdgeKind {
  if (gates.some((g) => g.kind === "lock")) return "lock";
  const g = gates.find((g) => g.kind === "state" || g.kind === "on" || g.kind === "off");
  if (g) return g.kind as EdgeKind;
  if (gates.length) return "state"; // a kind the generator does not write
  return secret ? "secret" : oneway ? "one" : "both";
}

const gateLabel = (g: Gate) => `[${g.requires.map((o) => o.name).join(" + ")}${g.kind === "on" ? " ON" : g.kind === "off" ? " OFF" : ""}]`;

const quad = (p: Point, c: Point, q: Point, t: number): Point => ({
  x: (1 - t) ** 2 * p.x + 2 * t * (1 - t) * c.x + t ** 2 * q.x,
  y: (1 - t) ** 2 * p.y + 2 * t * (1 - t) * c.y + t ** 2 * q.y,
});

// Across: laid out top to bottom with each box's width and height swapped, then mirrored across the
// diagonal, so one algorithm serves both.
export function graphLayout(graph: RoomGraph, { across = false, look = (id) => node(graph, id) }: GraphOptions = {}): GraphLayout {
  const byNumber = (a: RoomId, b: RoomId) => graph.rooms.get(a)!.number - graph.rooms.get(b)!.number || a - b;
  const neighbours = new Map<RoomId, RoomId[]>([...graph.rooms.keys()].map((id) => [id, []]));
  for (const d of graph.doors) neighbours.get(d.a)!.push(d.b), neighbours.get(d.b)!.push(d.a);

  // Layer: BFS distance from START over the undirected graph, top to bottom; GOAL in the deepest
  // layer (Graphviz rank=max in the Python plot). Unreachable rooms (a hand-made JSON can have
  // them) in a last layer of their own.
  const layer = new Map<RoomId, number>([[graph.start, 0]]);
  for (let queue = [graph.start]; queue.length; ) {
    const next: RoomId[] = [];
    for (const r of queue)
      for (const n of neighbours.get(r)!)
        if (!layer.has(n)) layer.set(n, layer.get(r)! + 1), next.push(n);
    queue = next;
  }
  const deepest = Math.max(...layer.values());
  if (layer.has(graph.goal) && graph.goal !== graph.start) layer.set(graph.goal, deepest);
  for (const id of graph.rooms.keys()) if (!layer.has(id)) layer.set(id, deepest + 1);
  // A layer GOAL alone leaves is dropped, and the ones below move up.
  const used = [...new Set(layer.values())].sort((a, b) => a - b);
  for (const [id, l] of layer) layer.set(id, used.indexOf(l));
  const layers: RoomId[][] = used.map(() => []);
  for (const id of [...graph.rooms.keys()].sort(byNumber)) layers[layer.get(id)!]!.push(id);

  // Order: barycenter of the neighbours in the layer before (down) or after (up); a room without
  // any keeps its place. Ties by room number.
  const pos = new Map<RoomId, number>();
  const index = (l: RoomId[]) => l.forEach((id, i) => pos.set(id, i));
  layers.forEach(index);
  const reorder = (i: number, from: number) => {
    const bary = new Map(
      layers[i]!.map((id) => {
        const ns = neighbours.get(id)!.filter((n) => layer.get(n) === from);
        return [id, ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : pos.get(id)!];
      }),
    );
    layers[i]!.sort((a, b) => bary.get(a)! - bary.get(b)! || byNumber(a, b));
    index(layers[i]!);
  };
  for (let s = 0; s < sweeps; s++) {
    for (let i = 1; i < layers.length; i++) reorder(i, i - 1);
    for (let i = layers.length - 2; i >= 0; i--) reorder(i, i + 1);
  }

  // One edge per room pair, as the map's door groups: all the pair's gates on it; secret and
  // one-way only when every door of the pair is (opposite one-ways cross both ways).
  const groups = new Map<string, Door[]>();
  for (const d of graph.doors) {
    const k = [d.a, d.b].sort((p, q) => p - q).join("-");
    if (groups.has(k)) groups.get(k)!.push(d);
    else groups.set(k, [d]);
  }
  const before = (p: RoomId, q: RoomId) => layer.get(p)! - layer.get(q)! || pos.get(p)! - pos.get(q)!;
  const pairs = [...groups.values()]
    .map((group) => {
      const [first] = group as [Door];
      const [a, b] = before(first.a, first.b) < 0 ? [first.a, first.b] : [first.b, first.a];
      const gates = group.flatMap((d) => (d.gate && d.gate.kind !== "secret" ? [d.gate] : []));
      const secret = group.every((d) => d.gate?.kind === "secret");
      const label = gates.length ? gates.map(gateLabel).join(" ") : secret ? "secret" : undefined;
      return { a, b, group, first, gates, secret, label };
    })
    .sort((p, q) => before(p.a, q.a) || before(p.b, q.b));

  // Rows top to bottom, each as tall as its tallest box (all alike unless across), so straight
  // edges between adjacent rows stay in the gaps; each row centred, each box centred in its row.
  // Across, a gap is also as wide as the labels of the edges crossing it.
  const boxes = new Map<RoomId, GraphBox>();
  const sized = layers.map((l) =>
    l.map((id) => {
      const n = look(id);
      const w = Math.round(boxText(n).length * charWidth + 2 * (n.shape === "item" || n.shape === "switch" ? roundPad : boxPad));
      return { id, ...n, w: across ? boxHeight : w, h: across ? w : boxHeight };
    }),
  );
  const rowWidth = (r: { w: number }[]) => r.reduce((s, b) => s + b.w, 0) + (r.length - 1) * colGap;
  const widest = Math.max(...sized.map(rowWidth));
  const rowHeight = sized.map((row) => Math.max(...row.map((b) => b.h)));
  const gaps = layers.map((_, i) => {
    const labels = across ? pairs.filter((p) => p.label && layer.get(p.a) === i && layer.get(p.b)! > i) : [];
    return Math.max(across ? acrossGap : rowGap, ...labels.map((p) => Math.ceil(p.label!.length * labelCharWidth) + 2 * labelGap));
  });
  const rowY = rowHeight.map((_, i) => rowHeight.slice(0, i).reduce((s, h, j) => s + h + gaps[j]!, 0));
  sized.forEach((row, i) => {
    let x = (widest - rowWidth(row)) / 2;
    for (const b of row) {
      boxes.set(b.id, { ...b, layer: i, x, y: rowY[i]! + (rowHeight[i]! - b.h) / 2 });
      x += b.w + colGap;
    }
  });

  // Adjacent layers: straight, bottom of a to top of b. Same layer: a curve out of the bottoms,
  // dipping into the gap below. Skipping layers (GOAL's edges): bottom to top, straight if clear,
  // else bowed sideways, further each try, until no point of it is near a box between.
  // y grows along such a curve, so only the rows between can be in its way, never its own ends.
  const clear = (p: Point, c: Point, q: Point, others: GraphBox[]) => {
    const n = Math.ceil((Math.hypot(q.x - p.x, q.y - p.y) + Math.abs(c.x - (p.x + q.x) / 2)) / 2);
    for (let i = 1; i < n; i++) {
      const s = quad(p, c, q, i / n);
      if (others.some((o) => o.x - clearance < s.x && s.x < o.x + o.w + clearance && o.y - clearance < s.y && s.y < o.y + o.h + clearance)) return false;
    }
    return true;
  };
  let edges = pairs.map(({ a, b, group, first, gates, secret, label }): GraphEdge => {
    const [ba, bb] = [boxes.get(a)!, boxes.get(b)!];
    const oneway = group.every((d) => d.oneway && d.a === first.a);
    const from = { x: ba.x + ba.w / 2, y: ba.y + ba.h };
    const same = ba.layer === bb.layer;
    const to = { x: bb.x + bb.w / 2, y: same ? bb.y + bb.h : bb.y };
    let ctrl: Point | undefined;
    // A same-layer curve's dip (half its bow) stays clear of the next row.
    if (same) ctrl = { x: (from.x + to.x) / 2, y: from.y + Math.min(2 * (gaps[ba.layer]! - 20), 24 + Math.abs(to.x - from.x) / 4) };
    else if (bb.layer - ba.layer > 1) {
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const between = [...boxes.values()].filter((o) => o.layer > ba.layer && o.layer < bb.layer);
      // Ends: the bow grows without bound, so it always gets past the rows between; the cap only
      // guards against a bug.
      for (let k = 0; ; k++) {
        const c = { x: mid.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * step, y: mid.y };
        if (clear(from, c, to, between)) {
          ctrl = k ? c : undefined;
          break;
        }
        if (k > 10000) throw new Error(`No way past the rooms between ${graph.rooms.get(a)!.number} and ${graph.rooms.get(b)!.number}`);
      }
    }
    return {
      a,
      b,
      from,
      to,
      ...(ctrl ? { ctrl } : {}),
      gates,
      kind: edgeKind(gates, secret, oneway),
      ...(label ? { label } : {}),
      secret,
      ...(oneway ? { towards: first.b } : {}),
      ...(across && !same ? { labelX: rowY[ba.layer]! + rowHeight[ba.layer]! + gaps[ba.layer]! / 2 } : {}),
    };
  });

  const tall = rowY.at(-1)! + rowHeight.at(-1)!;
  if (across) {
    const flip = (p: Point): Point => ({ x: p.y, y: p.x });
    for (const [id, b] of boxes) boxes.set(id, { ...b, x: b.y, y: b.x, w: b.h, h: b.w });
    edges = edges.map((e) => ({ ...e, from: flip(e.from), to: flip(e.to), ...(e.ctrl ? { ctrl: flip(e.ctrl) } : {}) }));
  }

  // Everything drawn, curves and edge labels included.
  const xs: number[] = [0, across ? tall : widest];
  const ys: number[] = [0, across ? widest : tall];
  for (const e of edges) {
    const c = e.ctrl ?? e.from;
    for (let i = 0; i <= 8; i++) {
      const s = quad(e.from, c, e.to, i / 8);
      xs.push(s.x), ys.push(s.y);
    }
    if (e.label) {
      const m = labelAt(e, across);
      const w = e.label.length * labelCharWidth;
      xs.push(...(m.anchor === "middle" ? [m.x - w / 2, m.x + w / 2] : [m.x + (m.anchor === "end" ? -w : w)]));
      ys.push(m.y + 4, ...(across ? [m.y - 10] : []));
    }
  }
  return { layers, boxes, edges, across, bbox: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}

type Anchor = "start" | "middle" | "end";

// An edge label beside the edge's middle, on the side the edge leans to, so the labels of edges
// fanning out of one room part ways: left or right of it top to bottom (anchored at its end on
// the left). Across: in the gap after the edge's first box (so a curve skipping layers keeps it
// clear of the boxes between), centred above or below the edge as far off as its slope under the
// text needs, on a flat edge over the line (the halo cuts it); a curve within a layer on its right.
function labelAt(e: GraphEdge, across: boolean, length = e.label?.length ?? 0): Point & { anchor: Anchor } {
  if (across && e.labelX !== undefined) {
    const c = e.ctrl ?? e.from;
    let [lo, hi] = [0, 1]; // x grows along the edge: bisect for labelX
    for (let i = 0; i < 30; i++) [lo, hi] = quad(e.from, c, e.to, (lo + hi) / 2).x < e.labelX ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
    const t = (lo + hi) / 2;
    const m = quad(e.from, c, e.to, t);
    const d = e.ctrl ? { x: (1 - t) * (c.x - e.from.x) + t * (e.to.x - c.x), y: (1 - t) * (c.y - e.from.y) + t * (e.to.y - c.y) } : { x: e.to.x - e.from.x, y: e.to.y - e.from.y };
    const slope = Math.abs(d.y / d.x);
    if (slope < 0.05) return { x: m.x, y: m.y + 3.5, anchor: "middle" };
    const off = 5 + (slope * length * labelCharWidth) / 2;
    return { x: m.x, y: d.y > 0 ? m.y + off + 8 : m.y - off, anchor: "middle" };
  }
  const m = quad(e.from, e.ctrl ?? e.from, e.to, 0.5);
  if (across) return { x: m.x + 6, y: m.y + 3, anchor: "start" };
  const lean = e.ctrl && e.from.y !== e.to.y ? e.ctrl.x - (e.from.x + e.to.x) / 2 : e.to.x - e.from.x;
  const end = lean < 0;
  return { x: m.x + (end ? -6 : 6), y: m.y + (e.ctrl ? 0 : 3), anchor: end ? "end" : "start" };
}

export const graphCss = `<style>
.g-node{font-size:12px;font-weight:400;text-anchor:middle}
.g-node tspan.g-number{font-weight:700}
.g-room{stroke:none}
.g-special{fill:${special};stroke:#000;stroke-width:1.5}
.g-item{fill:${pickup};stroke:none}
.g-switch{fill:${switchFill};stroke:none}
.edge{fill:none;stroke:${edgeColour.both};stroke-width:1}
.edge.one{stroke:${edgeColour.one};stroke-width:2}
.edge.lock{stroke:${edgeColour.lock};stroke-width:2}
.edge.state,.edge.on,.edge.off{stroke:${edgeColour.state};stroke-width:2}
.edge.off,.edge.secret{stroke-dasharray:5 3}
.edge.secret{stroke:${edgeColour.secret}}
.g-label{font-size:10px;font-weight:400;paint-order:stroke;stroke:${page};stroke-width:3px;stroke-linejoin:round}
</style>`;

// The box's outline: rounded box, ellipse or hexagon.
function outline(b: { x: number; y: number; w: number; h: number; shape: Shape }, fill: string): string {
  const { x, y, w, h } = b;
  if (b.shape === "item") return `<ellipse class="g-item" cx="${round(x + w / 2)}" cy="${round(y + h / 2)}" rx="${round(w / 2)}" ry="${h / 2}"/>`;
  if (b.shape === "switch") {
    const pts = [[x, y + h / 2], [x + 12, y], [x + w - 12, y], [x + w, y + h / 2], [x + w - 12, y + h], [x + 12, y + h]];
    return `<polygon class="g-switch" points="${pts.map(([px, py]) => `${round(px!)},${round(py!)}`).join(" ")}"/>`;
  }
  const stroke = fill === roomFallback[0] ? ` stroke="#000"` : ""; // an unknown type, white
  return `<rect class="g-${b.shape === "special" ? "special" : "room"}"${b.shape === "room" ? ` fill="${fill}"${stroke}` : ""} x="${round(x)}" y="${round(y)}" width="${b.w}" height="${h}" rx="6"/>`;
}

// Arrowhead at p, pointing along d.
export function arrow(p: Point, d: Point, kind: EdgeKind): string {
  const l = Math.hypot(d.x, d.y) || 1;
  const [ux, uy] = [d.x / l, d.y / l];
  const at = (along: number, across: number) => `${round(p.x - ux * along - uy * across)},${round(p.y - uy * along + ux * across)}`;
  return `<polygon class="arrow" fill="${edgeColour[kind]}" points="${at(0, 0)} ${at(9, 4)} ${at(9, -4)}"/>`;
}

// The layout's edges, boxes and edge labels, each point through px: the graph view's body and
// each variant diagram of the grammar sheet.
export function graphBody(l: GraphLayout, graph: RoomGraph, px: (p: Point) => Point): string[] {
  const marks: string[] = [];
  for (const e of l.edges) {
    const [p, q] = [px(e.from), px(e.to)];
    const d = e.ctrl ? `M${p.x} ${p.y}Q${px(e.ctrl).x} ${px(e.ctrl).y} ${q.x} ${q.y}` : `M${p.x} ${p.y}L${q.x} ${q.y}`;
    const n = (id: RoomId) => esc(String(graph.rooms.get(id)!.number));
    const gate = e.gates.length ? ` data-gate="${esc(e.gates.map((g) => g.kind).join(" "))}"` : "";
    marks.push(`<path class="edge ${e.kind}" data-edge="${n(e.a)}-${n(e.b)}"${gate} d="${d}"/>`);
    // One-way: the arrowhead on the room it leads to, along the edge's end.
    if (e.towards !== undefined) {
      const c = e.ctrl ?? e.from;
      marks.push(e.towards === e.b ? arrow(q, { x: e.to.x - c.x, y: e.to.y - c.y }, e.kind) : arrow(p, { x: e.from.x - (e.ctrl ?? e.to).x, y: e.from.y - (e.ctrl ?? e.to).y }, e.kind));
    }
  }
  for (const b of l.boxes.values()) {
    const { x, y } = px(b);
    marks.push(outline({ ...b, x, y }, b.fill));
    const number = b.number === undefined ? undefined : esc(b.number);
    if (number === undefined && !b.label) continue; // a grammar anchor, blank
    const text = number === undefined ? esc(b.label) : `<tspan class="g-number">${number}</tspan> ${esc(b.label)}`;
    marks.push(`<text class="g-node"${number === undefined ? "" : ` data-room="${number}"`} x="${round(x + b.w / 2)}" y="${round(y + b.h / 2 + 4)}" fill="${b.colour}">${text}</text>`);
  }
  for (const e of l.edges) {
    if (!e.label) continue;
    const at = labelAt(e, l.across);
    const m = px(at);
    const anchor = at.anchor === "start" ? "" : ` text-anchor="${at.anchor}"`;
    marks.push(`<text class="g-label"${anchor} x="${m.x}" y="${m.y}" fill="${e.kind === "secret" ? "#666" : edgeColour[e.kind]}">${esc(e.label)}</text>`);
  }
  return marks;
}

// Graph → standalone SVG: graph on the left, key column on the right (rooms by number, legend).
export function renderGraph(graph: RoomGraph, meta: TitleMeta): string {
  const l = graphLayout(graph);
  const top = margin + titleHeight;
  const px = (p: Point) => ({ x: round(margin + p.x - l.bbox.x0), y: round(top + p.y - l.bbox.y0) });
  const marks = graphBody(l, graph, px);

  // Legend of what is drawn: room types in the Python plot's order, unknown ones after, nodes, paths.
  const codes = new Set([...l.boxes.values()].filter((b) => b.shape === "room").map((b) => b.code));
  const shapes = new Set([...l.boxes.values()].map((b) => b.shape));
  const kinds = new Set(l.edges.map((e) => e.kind));
  const oneway = l.edges.some((e) => e.towards !== undefined);
  const swatch = (fill: string, extra = "") => `<rect x="0" y="-11" width="14" height="14" rx="3" fill="${fill}"${extra}/>`;
  const line = (k: EdgeKind) => `<path class="edge ${k}" d="M0 -4H14"/>`;
  const legend = [
    ...Object.entries(roomStyle).filter(([c]) => codes.has(c)).map(([c, [fill, , text]]) => ({ mark: swatch(fill), text: `${c}  ${text}` })),
    ...[...codes].filter((c) => !roomStyle[c]).sort().map((c) => ({ mark: swatch("#fff", ' stroke="#000"'), text: `${esc(c)}  ${roomFallback[2]}` })),
    ...(shapes.has("special") ? [{ mark: swatch(special, ' stroke="#000"'), text: "START  start, goal" }] : []),
    ...(shapes.has("item") ? [{ mark: `<ellipse cx="7" cy="-4" rx="7" ry="5" fill="${pickup}"/>`, text: "Get  pickup: key, boss key, item" }] : []),
    ...(shapes.has("switch") ? [{ mark: `<polygon points="0,-4 4,-9 10,-9 14,-4 10,1 4,1" fill="${switchFill}"/>`, text: "switch  switch / lever (sets a state)" }] : []),
    ...(kinds.has("both") ? [{ mark: line("both"), text: "two-way path" }] : []),
    ...(oneway ? [{ mark: line("one") + arrow({ x: 14, y: -4 }, { x: 1, y: 0 }, "one"), text: "one-way path (drop, ledge)" }] : []),
    ...(kinds.has("lock") ? [{ mark: line("lock"), text: "[key]  locked: needs that object" }] : []),
    ...(kinds.has("state") ? [{ mark: line("state"), text: "[switch]  state gate: open when all switches hit" }] : []),
    ...(kinds.has("on") ? [{ mark: line("on"), text: "[lever ON]  toggle gate: open in that lever position" }] : []),
    ...(kinds.has("off") ? [{ mark: line("off"), text: "[lever OFF]  toggle gate: open in that lever position" }] : []),
    ...(kinds.has("secret") ? [{ mark: line("secret"), text: "secret  hidden path" }] : []),
  ];
  const k = keyColumn([...graph.rooms.values()], [], legend, round(margin + l.bbox.x1 - l.bbox.x0 + gap), top);
  const t = titleBlock(meta, "graph");
  const width = Math.ceil(Math.max(k.x1, t.x1) + margin);
  const height = Math.ceil(Math.max(top + l.bbox.y1 - l.bbox.y0, k.y1) + margin);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    plain.css,
    graphCss,
    `<rect width="${width}" height="${height}" fill="${page}"/>`,
    ...t.marks,
    ...marks,
    ...k.marks,
    `</svg>`,
  ].join("\n");
}

// JSON → graph SVG, titled from the JSON: the CLI and the viewer draw through this.
export function drawGraph(json: DungeonJson): { svg: string; rooms: number } {
  const graph = normalize(json);
  const meta = { seed: isSeed(json.seed) ? json.seed : undefined, theme: json.theme, size: json.size, grammar: json.grammar };
  return { svg: renderGraph(graph, meta), rooms: graph.rooms.size };
}
