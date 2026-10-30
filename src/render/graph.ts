import type { Point, Rect } from "../engine/geometry";
import { normalize } from "../engine/normalize";
import { isSeed } from "../engine/rng";
import type { Door, DungeonJson, Gate, RoomGraph, RoomId } from "../engine/types";
import { defs, glyphSize } from "./icons";
import { esc, roomMarks, round, tagBox, tagMark } from "./marks";
import { roomGlyphs } from "./scene";
import { gap, glyphLegend, keyColumn, margin, plain, titleBlock, titleHeight, type RenderMeta } from "./svg";

// The dungeon's room graph as a layered drawing (docs/design.md § Graph view): no planarity, no
// layout, no seed, so it also draws a dungeon that fails to lay out. Sugiyama-lite, deterministic.
export type GraphBox = { id: RoomId; layer: number; x: number; y: number; w: number; h: number };
export type GraphEdge = {
  a: RoomId; // the end first in (layer, position)
  b: RoomId;
  from: Point; // on a's box
  to: Point; // on b's box
  ctrl?: Point; // a quadratic curve's control point; straight when absent
  gates: Gate[]; // the pair's gates but secret
  tag?: string; // A, B, … when there are gates
  secret: boolean;
  towards?: RoomId; // one-way: the room it leads to
};
export type GraphLayout = { layers: RoomId[][]; boxes: Map<RoomId, GraphBox>; edges: GraphEdge[]; bbox: Rect };
export type GraphMeta = Omit<RenderMeta, "layoutSeed" | "style">;

const sweeps = 8; // barycenter sweeps, each down then up
const boxHeight = 44;
const minBoxWidth = 48;
const boxPad = 8; // px, glyph row to box side
const layerGap = 112; // px between columns
const rowGap = 28; // px between boxes in a column
const maxBow = 2 * (layerGap - 24); // a same-layer curve's peak (half its bow) and tag stay clear of the next column
const markOffset = 12; // px from the edge's middle to a one-way chevron, past the tag

// A, B, … Z, AA, AB, … as scene.ts.
const letter = (i: number): string => (i < 26 ? "" : letter(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));

export function graphLayout(graph: RoomGraph): GraphLayout {
  const byNumber = (a: RoomId, b: RoomId) => graph.rooms.get(a)!.number - graph.rooms.get(b)!.number || a - b;
  const neighbours = new Map<RoomId, RoomId[]>([...graph.rooms.keys()].map((id) => [id, []]));
  for (const d of graph.doors) neighbours.get(d.a)!.push(d.b), neighbours.get(d.b)!.push(d.a);

  // Layer: BFS distance from START over the undirected graph, so every edge joins the same or
  // adjacent layers. Unreachable rooms (a hand-made JSON can have them) in a last layer of their own.
  const layer = new Map<RoomId, number>([[graph.start, 0]]);
  for (let queue = [graph.start]; queue.length; ) {
    const next: RoomId[] = [];
    for (const r of queue)
      for (const n of neighbours.get(r)!)
        if (!layer.has(n)) layer.set(n, layer.get(r)! + 1), next.push(n);
    queue = next;
  }
  const reached = Math.max(...layer.values()) + 1;
  const layers: RoomId[][] = Array.from({ length: reached }, () => []);
  for (const id of [...graph.rooms.keys()].sort(byNumber)) {
    if (!layer.has(id)) layer.set(id, reached);
    (layers[layer.get(id)!] ??= []).push(id);
  }

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

  // Columns left to right, one width per column so straight edges stay in the gaps; each column
  // centred vertically.
  const glyphs = new Map([...graph.rooms.keys()].map((id) => [id, roomGlyphs(graph, id)]));
  const widths = layers.map((l) => Math.max(minBoxWidth, ...l.map((id) => glyphs.get(id)!.length * (glyphSize + 3) - 3 + 2 * boxPad)));
  const heights = layers.map((l) => l.length * boxHeight + (l.length - 1) * rowGap);
  const tallest = Math.max(...heights);
  const boxes = new Map<RoomId, GraphBox>();
  let x = 0;
  layers.forEach((l, i) => {
    l.forEach((id, j) => boxes.set(id, { id, layer: i, x, y: (tallest - heights[i]!) / 2 + j * (boxHeight + rowGap), w: widths[i]!, h: boxHeight }));
    x += widths[i]! + layerGap;
  });

  // One edge per room pair, as the map's door groups: all the pair's gates on it; secret and
  // one-way only when every door of the pair is (opposite one-ways cross both ways).
  const groups = new Map<string, Door[]>();
  for (const d of graph.doors) {
    const k = [d.a, d.b].sort((p, q) => p - q).join("-");
    if (groups.has(k)) groups.get(k)!.push(d);
    else groups.set(k, [d]);
  }
  const rank = (id: RoomId) => [layer.get(id)!, pos.get(id)!] as const;
  const before = (p: RoomId, q: RoomId) => rank(p)[0] - rank(q)[0] || rank(p)[1] - rank(q)[1];
  const pairs = [...groups.values()]
    .map((group) => {
      const [first] = group as [Door];
      const [a, b] = before(first.a, first.b) < 0 ? [first.a, first.b] : [first.b, first.a];
      return { a, b, group, first };
    })
    .sort((p, q) => before(p.a, q.a) || before(p.b, q.b));

  // Adjacent layers: straight, right side of a to left side of b. Same layer: a curve out of the
  // right sides, bowed right, so it stays between this column and the next.
  let tags = 0;
  const edges = pairs.map(({ a, b, group, first }): GraphEdge => {
    const [ba, bb] = [boxes.get(a)!, boxes.get(b)!];
    const gates = group.flatMap((d) => (d.gate && d.gate.kind !== "secret" ? [d.gate] : []));
    const oneway = group.every((d) => d.oneway && d.a === first.a);
    const from = { x: ba.x + ba.w, y: ba.y + ba.h / 2 };
    const same = ba.layer === bb.layer;
    const to = same ? { x: bb.x + bb.w, y: bb.y + bb.h / 2 } : { x: bb.x, y: bb.y + bb.h / 2 };
    const bow = Math.min(maxBow, 24 + Math.abs(to.y - from.y) / 2);
    return {
      a,
      b,
      from,
      to,
      ...(same ? { ctrl: { x: from.x + bow, y: (from.y + to.y) / 2 } } : {}),
      gates,
      ...(gates.length ? { tag: letter(tags++) } : {}),
      secret: group.every((d) => d.gate?.kind === "secret"),
      ...(oneway ? { towards: first.b } : {}),
    };
  });

  const ext = edges.flatMap((e) => (e.ctrl ? [(e.from.x + e.ctrl.x) / 2 + tagBox / 2] : []));
  return { layers, boxes, edges, bbox: { x0: 0, y0: 0, x1: Math.max(x - layerGap, ...ext), y1: tallest } };
}

// The edge's middle and unit tangent there, pointing from a to b.
function middle(e: GraphEdge): { m: Point; u: Point } {
  const c = e.ctrl ?? { x: (e.from.x + e.to.x) / 2, y: (e.from.y + e.to.y) / 2 };
  const m = { x: (e.from.x + 2 * c.x + e.to.x) / 4, y: (e.from.y + 2 * c.y + e.to.y) / 4 };
  const d = { x: e.to.x - e.from.x, y: e.to.y - e.from.y };
  const l = Math.hypot(d.x, d.y) || 1;
  return { m, u: { x: d.x / l, y: d.y / l } };
}

const css = `<style>.edge{fill:none;stroke:#000;stroke-width:1}.edge.secret{stroke-dasharray:4 3}</style>`;

// Graph → standalone SVG in the plain look, whatever the theme: graph on the left, key column on
// the right, gate letters the graph's own.
export function renderGraph(graph: RoomGraph, meta: GraphMeta): string {
  const l = graphLayout(graph);
  const top = margin + titleHeight;
  const px = (p: Point) => ({ x: round(margin + p.x), y: round(top + p.y) });
  const marks: string[] = [];
  for (const b of l.boxes.values()) {
    const { x, y } = px(b);
    const room = { number: graph.rooms.get(b.id)!.number, glyphs: roomGlyphs(graph, b.id) };
    marks.push(`<rect class="room" x="${x}" y="${y}" width="${b.w}" height="${b.h}"/>`, ...roomMarks(room, { x: round(x + b.w / 2), y: round(y + b.h / 2 - (room.glyphs.length ? 1 : 0)) }, 7));
  }
  for (const e of l.edges) {
    const [p, q] = [px(e.from), px(e.to)];
    const d = e.ctrl ? `M${p.x} ${p.y}Q${px(e.ctrl).x} ${px(e.ctrl).y} ${q.x} ${q.y}` : `M${p.x} ${p.y}L${q.x} ${q.y}`;
    const n = (id: RoomId) => esc(String(graph.rooms.get(id)!.number));
    marks.push(`<path class="edge${e.secret ? " secret" : ""}" data-edge="${n(e.a)}-${n(e.b)}" d="${d}"/>`);
  }
  // Tags and chevrons over every edge; a chevron past its tag, towards the room it leads to.
  for (const e of l.edges) {
    const { m, u } = middle(e);
    const c = px(m);
    if (e.tag) marks.push(tagMark(c.x, c.y, e.tag, e.gates.map((g) => g.kind).join(" ")));
    if (e.towards !== undefined) {
      const s = e.towards === e.b ? 1 : -1;
      const [ux, uy] = [u.x * s, u.y * s];
      const o = e.tag ? markOffset : 0;
      const at = (along: number, across: number) => `${round(c.x + ux * (o + along) - uy * across)},${round(c.y + uy * (o + along) + ux * across)}`;
      marks.push(`<polyline class="oneway" points="${at(-2, -4)} ${at(2, 0)} ${at(-2, 4)}"/>`);
    }
  }

  const gateLines = l.edges.flatMap((e) => (e.tag ? [{ tag: e.tag, gates: e.gates }] : []));
  const legend = [
    ...glyphLegend([...graph.rooms.keys()].flatMap((id) => roomGlyphs(graph, id))),
    ...(gateLines.length ? [{ mark: `<rect class="tag" x="0" y="-11" width="14" height="14"/>`, text: "gate" }] : []),
    ...(l.edges.some((e) => e.secret) ? [{ mark: `<path class="edge secret" d="M0 -4H14"/>`, text: "secret door" }] : []),
    ...(l.edges.some((e) => e.towards !== undefined) ? [{ mark: `<polyline class="oneway" points="3,-8 7,-4 11,-8"/>`, text: "one-way" }] : []),
  ];
  const k = keyColumn([...graph.rooms.values()], gateLines, legend, round(margin + l.bbox.x1 + gap), top);
  const t = titleBlock(meta, "graph");
  const width = Math.ceil(Math.max(k.x1, t.x1) + margin);
  const height = Math.ceil(Math.max(top + l.bbox.y1, k.y1) + margin);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    plain.css,
    css,
    `<defs>${defs()}</defs>`,
    `<rect width="${width}" height="${height}" fill="${plain.page}"/>`,
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
