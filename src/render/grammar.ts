import type { Point } from "../engine/geometry";
import { GATE_KINDS, GRAMMAR, PACING, PRESETS, spectralRadius, type Preset, type Variant } from "../engine/generator/grammar";
import { generateDungeon } from "../engine/generator/index";
import { defaultGeneratorConfig } from "../engine/generator/config";
import { DEFAULT_THEME } from "../engine/generator/themes";
import type { Door, GameObject, GateKind, Room, RoomGraph, RoomId } from "../engine/types";
import { arrow, edgeColour, graphBody, graphCss, graphLayout, page, pickup, pickupTypes, special, switchFill, switchTypes, type EdgeKind, type GraphLayout, type Look } from "./graph";
import { esc, round } from "./marks";
import { plain } from "./svg";

// The Combined grammar as one sheet (docs/design.md § Generator): rule cards with the d20 range of
// each variant per size and its diagram, legend, how to use, expected size. After Python's
// grammar/render.py sheet (Graphviz), drawn with the graph view's painter, left to right.

const tint = "#f6f7f9"; // every other variant row
const ink = "#2f343c"; // card headers
const anchorFill = { prev: "#7b8cde", next: "#7fd6d6" }; // Python's NODE_STYLE
const ntFill = "#e8735a";
const roomFill = "#7cc98f";
const runs = 1000; // dungeons per preset for the size table; Python ran 5000, 1000 keeps the staleness test under 2 s

const margin = 40;
const colGap = 28;
const cardGap = 18;
const headHeight = 28;
const subHeight = 20; // the preset header row
const rangeWidth = 46;
const minRow = 36;
const rowPad = 8;
const pad = 10;
const lineHeight = 16;
const textWidth = (s: string, size: number, bold = false) => s.length * size * (bold ? 0.64 : 0.58);

// One variant as a room graph: prev START (Start) or a blank anchor, the nodes in variant order,
// next GOAL or a blank anchor (a branch rule has none: goal = start); edges as doors with gates.
// Labels: K() for non-terminals, the room code, the object name for items and switches.
export function variantGraph(symbol: string, v: Variant): RoomGraph {
  const isStart = symbol === "Start";
  const objects = v.objects ?? {};
  const object = (id: string): GameObject => ({ id, type: objects[id]![0], name: objects[id]![1] });
  const rooms = new Map<RoomId, Room>();
  const ids = new Map<string, RoomId>();
  const add = (key: string, type: string, label: string, objs: GameObject[] = []) => {
    const id = rooms.size;
    ids.set(key, id);
    rooms.set(id, { id, type, number: id + 1, label, objects: objs });
  };
  add("prev", isStart ? "st" : "prev", isStart ? "START" : "");
  for (const [id, kind, label] of v.nodes) {
    if (kind === "nt") add(id, "nt", `${label}()`);
    else if (kind === "item" || kind === "switch") add(id, objects[label]![0], objects[label]![1], [object(label)]);
    else add(id, kind === "special" ? "special" : label, label);
  }
  if (v.edges.some(([a, b]) => a === "next" || b === "next")) add("next", isStart ? "gl" : "next", isStart ? "GOAL" : "");
  const doors = v.edges.map(([a, b, kind, ...oids]): Door => {
    const door = { a: ids.get(a)!, b: ids.get(b)!, oneway: kind === "one" };
    return GATE_KINDS.includes(kind) ? { ...door, gate: { kind: kind as GateKind, requires: oids.map(object) } } : door;
  });
  return { rooms, doors, start: 0, goal: ids.get("next") ?? 0 };
}

// Python's sheet colours: anchors blue and teal, non-terminals red, rooms green; pickups,
// switches and START, GOAL, EXIT as in the graph view. No numbers.
export const variantLook =
  (g: RoomGraph) =>
  (id: RoomId): Look => {
    const { type, label } = g.rooms.get(id)!;
    const look = { code: type, label, colour: "#000" };
    if (type === "prev" || type === "next") return { ...look, shape: "room", fill: anchorFill[type] };
    if (type === "st" || type === "gl" || type === "special") return { ...look, shape: "special", fill: special };
    if (pickupTypes.has(type)) return { ...look, shape: "item", fill: pickup };
    if (switchTypes.has(type)) return { ...look, shape: "switch", fill: switchFill };
    return { ...look, shape: "room", fill: type === "nt" ? ntFill : roomFill };
  };

export type SizeStats = { rho: number; mean: number; p10: number; median: number; p90: number; max: number };

// Rooms of generated dungeons, seeds 1 to runs, after merge (what the map shows; Python counted
// before merge). Percentiles as Python's size_stats.
export function sizeStats(preset: Preset, n = runs): SizeStats {
  const rooms = Array.from({ length: n }, (_, i) => generateDungeon({ seed: i + 1, size: preset }).nodes.filter((v) => v.kind === "room").length).sort((a, b) => a - b);
  const pct = (q: number) => rooms[Math.min(rooms.length - 1, Math.floor(q * rooms.length))]!;
  return { rho: spectralRadius(preset), mean: rooms.reduce((s, r) => s + r, 0) / rooms.length, p10: pct(0.1), median: pct(0.5), p90: pct(0.9), max: rooms.at(-1)! };
}

const css = `<style>
.s-title{font-size:26px;font-weight:700}
.s-sub{font-size:13px;font-weight:400;fill:#555}
.card{fill:#fff;stroke:#d0d0d0;stroke-width:1}
.head{fill:${ink}}
.head-title{font-size:14px;font-weight:700;fill:#fff}
.head-sub{font-size:11px;font-weight:400;fill:#c9ced6}
.col{font-size:9px;font-weight:400;fill:#777;text-anchor:middle}
.range{font-size:11px;font-weight:400;text-anchor:middle}
.name{font-size:9px;font-weight:400;fill:#555}
.body{font-size:11px;font-weight:400}
.note{font-size:9px;font-weight:400;fill:#555}
.cell{font-size:11px;font-weight:400;text-anchor:middle}
.key{font-size:11px;font-weight:700}
.g-label{stroke:#fff}
.tint .g-label{stroke:${tint}}
</style>`;

type Card = { w: number; h: number; draw: (x: number, y: number, w: number) => string[] };

const header = (title: string, sub: string) => ({
  w: pad + textWidth(title, 14, true) + 10 + textWidth(sub, 11) + pad,
  draw: (x: number, y: number, w: number) => [
    `<rect class="head" x="${x}" y="${y}" width="${w}" height="${headHeight}"/>`,
    `<text class="head-title" x="${x + pad}" y="${y + 19}">${esc(title)}</text>`,
    `<text class="head-sub" x="${round(x + pad + textWidth(title, 14, true) + 10)}" y="${y + 19}">${esc(sub)}</text>`,
  ],
});

const frame = (x: number, y: number, w: number, h: number) => `<rect class="card" x="${x}" y="${y}" width="${w}" height="${h}"/>`;

const rangeText = (span: [number, number] | undefined) => (!span ? "—" : span[0] === span[1] ? String(span[0]) : `${span[0]}-${span[1]}`);

// A rule's card: columns of d20 ranges (the presets; R's pacing tiers), the variant's name, its
// diagram. Rows as tall as their diagram.
function ruleCard(symbol: string): Card {
  const rule = GRAMMAR[symbol]!;
  const paced = symbol === "R";
  const cols = paced ? ["early", "middle", "late"] : PRESETS;
  const ranges = (v: Variant) => (paced ? PACING.map(([, r]) => r[v.name]) : PRESETS.map((p) => v.ranges[p]));
  const sub = paced
    ? `${rule.desc} · rolled by progress to the boss, not by size`
    : symbol === "GB"
      ? `${rule.desc} · dead end · the theme's rewards (${DEFAULT_THEME} shown)`
      : rule.desc + (rule.branch ? " · dead end" : "");
  const head = header(`${symbol}()`, sub);
  const rows = rule.variants.map((v) => {
    const g = variantGraph(symbol, v);
    const l = graphLayout(g, { across: true, look: variantLook(g) });
    return { v, g, l, h: Math.max(minRow, Math.ceil(l.bbox.y1 - l.bbox.y0) + 2 * rowPad) };
  });
  const nameWidth = Math.ceil(Math.max(...rule.variants.map((v) => textWidth(v.name, 9)))) + 2 * pad;
  const diagramWidth = Math.ceil(Math.max(...rows.map((r) => r.l.bbox.x1 - r.l.bbox.x0)));
  const left = cols.length * rangeWidth;
  return {
    w: Math.max(head.w, left + nameWidth + diagramWidth + pad),
    h: headHeight + subHeight + rows.reduce((s, r) => s + r.h, 0),
    draw(x, y, w) {
      const marks = [`<g data-rule="${esc(symbol)}">`, frame(x, y, w, this.h), ...head.draw(x, y, w)];
      cols.forEach((c, i) => marks.push(`<text class="col" x="${x + (i + 0.5) * rangeWidth}" y="${y + headHeight + 14}">${c}</text>`));
      let top = y + headHeight + subHeight;
      rows.forEach(({ v, g, l, h }, i) => {
        marks.push(`<g${i % 2 ? ` class="tint"` : ""} data-variant="${esc(symbol)} ${esc(v.name)}">`);
        if (i % 2) marks.push(`<rect x="${x + 0.5}" y="${top}" width="${w - 1}" height="${h}" fill="${tint}"/>`);
        ranges(v).forEach((span, j) => marks.push(`<text class="range" x="${x + (j + 0.5) * rangeWidth}" y="${top + h / 2 + 4}">${rangeText(span)}</text>`));
        marks.push(`<text class="name" x="${x + left + pad}" y="${top + h / 2 + 3}">${esc(v.name)}</text>`);
        marks.push(...diagram(l, g, x + left + nameWidth, top + (h - (l.bbox.y1 - l.bbox.y0)) / 2));
        marks.push(`</g>`);
        top += h;
      });
      marks.push(`</g>`);
      return marks;
    },
  };
}

const diagram = (l: GraphLayout, g: RoomGraph, x: number, y: number) => graphBody(l, g, (p: Point) => ({ x: round(x + p.x - l.bbox.x0), y: round(y + p.y - l.bbox.y0) }));

// A card of text lines.
function textCard(id: string, title: string, lines: string[]): Card {
  const head = header(title, "");
  return {
    w: Math.max(head.w, Math.ceil(Math.max(...lines.map((s) => textWidth(s, 11)))) + 2 * pad),
    h: headHeight + pad + lines.length * lineHeight,
    draw(x, y, w) {
      return [
        `<g data-card="${id}">`,
        frame(x, y, w, this.h),
        ...head.draw(x, y, w),
        // SVG drops leading spaces: an indented line is moved instead.
        ...lines.map((s, i) => `<text class="body" x="${round(x + pad + textWidth(s.match(/^ */)![0], 11))}" y="${y + headHeight + pad + (i + 0.7) * lineHeight}">${esc(s.trimStart())}</text>`),
        `</g>`,
      ];
    },
  };
}

const howTo = () =>
  textCard("how-to", "How to use", [
    "1. Pick a size preset: XS, S, M or L. Its column gives the d20 ranges.",
    "2. Start with Start(): START and GOAL are its anchors.",
    "3. While red nodes remain: pick one, roll d20, replace it with the diagram of its range.",
    "    Blue = node before it, teal = node after it. Edges keep their direction.",
    "4. R() last, on its tier: early, middle or late by progress to the boss; late near a boss.",
    `5. GB() on the theme's rewards. Objects (keys, switches, levers, item) are new per rule.`,
    "6. Finally merge neighbouring n / e / t / p / c rooms of one type on plain two-way paths.",
    "",
    "Why it stays small and solvable:",
    "• Only L() and S() recurse. Every other rule expands once into a fixed shape.",
    "• Each lock rule places its key on a branch that forks before the lock.",
    "• Odds keep the expected size finite (ρ below 1). As a cap, past",
    `   ${defaultGeneratorConfig.maxNodes} nodes or ${defaultGeneratorConfig.maxIter} expansions L() and S() take room and end.`,
  ]);

// Legend: every node kind as its shape, every edge kind as its line, then the room codes.
function legendCard(): Card {
  const head = header("Legend", "");
  const swatch = (fill: string, extra = "") => `<rect x="0" y="-11" width="22" height="14" rx="4" fill="${fill}"${extra}/>`;
  const line = (k: EdgeKind) => `<path class="edge ${k}" d="M0 -4H22"/>`;
  const rows: { id: string; mark: string; key?: [string, string]; text: string }[] = [
    { id: "prev", mark: swatch(anchorFill.prev), text: "previous node (incoming anchor)" },
    { id: "next", mark: swatch(anchorFill.next), text: "next node (outgoing anchor)" },
    { id: "nt", mark: swatch(ntFill), text: "non-terminal: expand with its rule" },
    { id: "room", mark: swatch(roomFill), text: "room (terminal): n e t p c em eb gb" },
    { id: "item", mark: `<ellipse cx="11" cy="-4" rx="11" ry="7" fill="${pickup}"/>`, text: "pickup: small key, boss key, dungeon item" },
    { id: "switch", mark: `<polygon points="0,-4 5,-11 17,-11 22,-4 17,3 5,3" fill="${switchFill}"/>`, text: "switch / lever (sets a state)" },
    { id: "special", mark: swatch(special, ' stroke="#000" stroke-width="1.5"'), text: "START, GOAL, extra entrance" },
    { id: "both", mark: line("both"), text: "two-way path" },
    { id: "one", mark: line("one") + arrow({ x: 22, y: -4 }, { x: 1, y: 0 }, "one"), text: "one-way path (drop, ledge)" },
    { id: "lock", mark: line("lock"), key: ["[key]", edgeColour.lock], text: "locked: needs that object" },
    { id: "state", mark: line("state"), key: ["[switch]", edgeColour.state], text: "state gate: open when all switches hit" },
    { id: "on", mark: line("on"), key: ["[lever ON]", edgeColour.on], text: "toggle gate: open with the lever ON" },
    { id: "off", mark: line("off"), key: ["[lever OFF]", edgeColour.off], text: "toggle gate: open with the lever OFF" },
    { id: "secret", mark: line("secret"), key: ["secret", "#666"], text: "hidden path (bombable wall)" },
  ];
  const rooms = "n nothing · e enemy · t trap · p puzzle · c challenge · em mini-boss · eb boss · gb bonus goal";
  const keyWidth = 80;
  const textX = pad + 22 + 12 + keyWidth;
  const rowH = 20;
  return {
    w: Math.max(head.w, Math.ceil(Math.max(textX + Math.max(...rows.map((r) => textWidth(r.text, 11))), textWidth(rooms, 9))) + 2 * pad),
    h: headHeight + pad + rows.length * rowH + lineHeight + pad,
    draw(x, y, w) {
      const marks = [`<g data-card="legend">`, frame(x, y, w, this.h), ...head.draw(x, y, w)];
      rows.forEach((r, i) => {
        const base = y + headHeight + pad + (i + 0.75) * rowH;
        marks.push(
          `<g data-legend="${r.id}" transform="translate(${x + pad} ${base})">${r.mark}</g>`,
          ...(r.key ? [`<text class="key" x="${x + pad + 34}" y="${base}" fill="${r.key[1]}">${esc(r.key[0])}</text>`] : []),
          `<text class="body" x="${x + textX}" y="${base}">${esc(r.text)}</text>`,
        );
      });
      marks.push(`<text class="note" x="${x + pad}" y="${y + headHeight + pad + rows.length * rowH + 12}">${esc(rooms)}</text>`, `</g>`);
      return marks;
    },
  };
}

function statsCard(): Card {
  const head = header("Expected size", `rooms after merge, seeds 1-${runs}`);
  const cols = ["preset", "ρ", "mean", "p10", "median", "p90", "max"];
  const colW = 54;
  const rowH = 20;
  const values = PRESETS.map((p) => {
    const s = sizeStats(p);
    return [p, s.rho.toFixed(2), s.mean.toFixed(1), s.p10, s.median, s.p90, s.max].map(String);
  });
  const note = "ρ: spectral radius of the expected-offspring matrix. Below 1 = finite expected size.";
  return {
    w: Math.max(head.w, cols.length * colW, Math.ceil(textWidth(note, 9)) + 2 * pad),
    h: headHeight + (values.length + 1) * rowH + lineHeight + pad,
    draw(x, y, w) {
      const marks = [`<g data-card="size">`, frame(x, y, w, this.h), ...head.draw(x, y, w)];
      const row = (cells: string[], i: number, cls: string) =>
        cells.forEach((c, j) => marks.push(`<text class="${cls}" x="${x + (j + 0.5) * colW}" y="${y + headHeight + (i + 0.7) * rowH}">${esc(c)}</text>`));
      row(cols, 0, "col");
      values.forEach((v, i) => row(v, i + 1, "cell"));
      marks.push(`<text class="note" x="${x + pad}" y="${y + headHeight + (values.length + 1) * rowH + 12}">${esc(note)}</text>`, `</g>`);
      return marks;
    },
  };
}

// The sheet: Python's columns, cards stacked, each column as wide as its widest card.
export function renderGrammar(): string {
  const rule = (symbols: string[]) => symbols.map(ruleCard);
  const columns: Card[][] = [
    [howTo(), legendCard(), ...rule(["Start", "E", "R", "S"])],
    [...rule(["L"]), statsCard(), ...rule(["GB", "H"])],
    rule(["K", "SW", "TG", "IG", "BK"]),
  ];
  const top = margin + 50;
  const marks: string[] = [
    `<text class="s-title" x="${margin}" y="${margin + 24}">Combined dungeon grammar</text>`,
    `<text class="s-sub" x="${round(margin + textWidth("Combined dungeon grammar", 26, true) + 16)}" y="${margin + 24}">sizes XS / S / M / L · one d20 per rule</text>`,
  ];
  let x = margin;
  let bottom = top;
  for (const cards of columns) {
    const w = Math.ceil(Math.max(...cards.map((c) => c.w)));
    let y = top;
    for (const c of cards) {
      marks.push(...c.draw(x, y, w));
      y += c.h + cardGap;
    }
    bottom = Math.max(bottom, y - cardGap);
    x += w + colGap;
  }
  const width = Math.ceil(x - colGap + margin);
  const height = Math.ceil(bottom + margin);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    plain.css,
    graphCss,
    css,
    `<rect width="${width}" height="${height}" fill="${page}"/>`,
    ...marks,
    `</svg>`,
    "",
  ].join("\n");
}
