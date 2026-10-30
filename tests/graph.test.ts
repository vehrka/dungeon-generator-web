import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import type { Point } from "../src/engine/geometry";
import { generateDungeon } from "../src/engine/generator/index";
import { normalize } from "../src/engine/normalize";
import type { DungeonJson } from "../src/engine/types";
import { drawGraph, graphLayout, renderGraph, type GraphEdge, type GraphLayout } from "../src/render/graph";

const json = ruin as DungeonJson;
const graph = normalize(json);
const meta = { seed: json.seed, theme: json.theme, size: json.size, grammar: json.grammar };
const svg = renderGraph(graph, meta);
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

const room = (id: number) => ({ id, kind: "room" as const, type: "n", objects: [], number: id + 1, label: `R${id + 1}` });
// Rooms 0..n-1, doors as given (a, b, oneway), START 0, GOAL n-1.
const dungeon = (n: number, doors: [number, number, boolean?][], gates: { between: [number, number]; gate: "lock" | "state" | "secret"; oneway?: boolean }[] = []): DungeonJson => ({
  schema_version: 2,
  seed: 1,
  start: 0,
  goal: n - 1,
  nodes: [...Array.from({ length: n }, (_, i) => room(i)), ...gates.map((g, i) => ({ id: 100 + i, kind: "gate" as const, type: "g", gate: g.gate, requires: [] }))],
  edges: [
    ...doors.map(([source, target, oneway]) => ({ source, target, oneway: !!oneway })),
    ...gates.flatMap((g, i) => [
      { source: g.between[0], target: 100 + i, oneway: !!g.oneway },
      { source: 100 + i, target: g.between[1], oneway: !!g.oneway },
    ]),
  ],
  objects: [],
});

// Every point of the edge, every 2 px.
function samples(e: GraphEdge): Point[] {
  const { from: p, to: q, ctrl: c } = e;
  const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 2) + (c ? Math.ceil(Math.hypot(c.x - p.x, c.y - p.y) / 2) : 0);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const m = c ?? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    return { x: (1 - t) ** 2 * p.x + 2 * t * (1 - t) * m.x + t ** 2 * q.x, y: (1 - t) ** 2 * p.y + 2 * t * (1 - t) * m.y + t ** 2 * q.y };
  });
}

function crossings(l: GraphLayout): string[] {
  const out: string[] = [];
  for (const e of l.edges)
    for (const p of samples(e))
      for (const b of l.boxes.values())
        if (b.x + 0.5 < p.x && p.x < b.x + b.w - 0.5 && b.y + 0.5 < p.y && p.y < b.y + b.h - 0.5) out.push(`${e.a}-${e.b} through ${b.id} at ${p.x},${p.y}`);
  return [...new Set(out)];
}

describe("graphLayout", () => {
  it("puts START in layer 0 and each room in its BFS distance's layer", () => {
    const l = graphLayout(graph);
    expect(l.layers[0]).toEqual([graph.start]);
    const dist = new Map([[graph.start, 0]]);
    for (let queue = [graph.start]; queue.length; ) {
      const next: number[] = [];
      for (const r of queue)
        for (const d of graph.doors)
          for (const [x, y] of [[d.a, d.b], [d.b, d.a]] as const)
            if (x === r && !dist.has(y)) {
              dist.set(y, dist.get(r)! + 1);
              next.push(y);
            }
      queue = next;
    }
    for (const [id, b] of l.boxes) expect(b.layer).toBe(dist.get(id));
    expect(l.layers.flat().sort((a, b) => a - b)).toEqual([...graph.rooms.keys()].sort((a, b) => a - b));
  });

  it("puts unreachable rooms in a last layer of their own", () => {
    const l = graphLayout(normalize(dungeon(5, [[0, 1], [1, 2], [3, 4]])));
    expect(l.layers).toEqual([[0], [1], [2], [3, 4]]);
  });

  it("draws one edge per room pair, the pair's gates on it", () => {
    const l = graphLayout(normalize(dungeon(3, [[0, 1], [1, 0], [1, 2]], [{ between: [1, 2], gate: "lock" }, { between: [1, 2], gate: "state" }])));
    expect(l.edges).toHaveLength(2);
    const gated = l.edges.find((e) => e.gates.length)!;
    expect(gated.gates.map((g) => g.kind)).toEqual(["lock", "state"]);
    expect(gated.tag).toBe("A");
  });

  it("letters gates A, B, … in edge order, layer then position", () => {
    const l = graphLayout(normalize(dungeon(4, [], [
      { between: [2, 3], gate: "lock" },
      { between: [1, 3], gate: "lock" },
      { between: [0, 2], gate: "lock" },
      { between: [0, 1], gate: "lock" },
    ])));
    expect(l.layers).toEqual([[0], [1, 2], [3]]);
    expect(l.edges.map((e) => `${e.a}-${e.b} ${e.tag}`)).toEqual(["0-1 A", "0-2 B", "1-3 C", "2-3 D"]);
  });

  it("is secret and one-way only when every door of the pair is", () => {
    const l = graphLayout(normalize(dungeon(3, [[0, 1, true], [1, 2, true], [2, 1, true]], [{ between: [0, 1], gate: "secret" }])));
    const e01 = l.edges.find((e) => e.a + e.b === 1)!;
    const e12 = l.edges.find((e) => e.a + e.b === 3)!;
    expect([e01.secret, e01.towards, e01.tag]).toEqual([false, undefined, undefined]);
    expect(e12.towards).toBeUndefined(); // one-way both ways: crosses both ways
    const s = graphLayout(normalize(dungeon(2, [], [{ between: [0, 1], gate: "secret" }])));
    expect(s.edges[0]).toMatchObject({ secret: true, gates: [] });
    expect(s.edges[0]!.tag).toBeUndefined();
    const o = graphLayout(normalize(dungeon(2, [[1, 0, true]])));
    expect(o.edges[0]!.towards).toBe(0);
  });

  it("never runs an edge through a box", () => {
    expect(crossings(graphLayout(graph))).toEqual([]);
    for (const size of ["M", "L"] as const)
      for (let seed = 1; seed <= 8; seed++) expect(crossings(graphLayout(normalize(generateDungeon({ seed, size })))), `${size} ${seed}`).toEqual([]);
  });

  it("orders a layer by barycenter, so a two-layer tree does not cross", () => {
    // 0 – 1, 0 – 2, 1 – 4, 2 – 3: 3 and 4 follow their parents, not their numbers.
    const l = graphLayout(normalize(dungeon(5, [[0, 1], [0, 2], [1, 4], [2, 3]])));
    expect(l.layers[2]).toEqual([4, 3]);
  });
});

describe("renderGraph", () => {
  it("is a standalone svg", () => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" [^>]*viewBox="0 0 \d+ \d+"/);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("draws one box per room with its number and glyphs, one edge per room pair", () => {
    expect(count(svg, /<rect class="room"/g)).toBe(graph.rooms.size);
    for (const r of graph.rooms.values()) expect(count(svg, new RegExp(`<text class="number" data-room="${r.number}"`, "g"))).toBe(1);
    const pairs = new Set(graph.doors.map((d) => [d.a, d.b].sort((x, y) => x - y).join("-")));
    expect(count(svg, /<path class="edge/g)).toBe(pairs.size);
    expect(svg).toContain('<use href="#glyph-start"');
    expect(svg).toContain('<use href="#glyph-goal"');
  });

  it("tags gated edges and lists the gates in the key", () => {
    expect(count(svg, /data-gate="lock"/g)).toBe(3);
    expect(count(svg, /data-gate="state"/g)).toBe(1);
    expect(svg).toMatch(/<text class="tag-letter"[^>]*>A<\/text>\n<text x="[\d.]+" y="[\d.]+">lock  /);
    expect(svg).toContain(">gates</text>");
  });

  it("dashes secret edges, points one-way chevrons from a to b, legend only what is drawn", () => {
    const one = renderGraph(normalize(dungeon(2, [[0, 1, true]])), {});
    const pts = one.match(/<polyline class="oneway" points="([^"]+)"/)![1]!.split(" ").map((p) => p.split(",").map(Number));
    expect(pts[1]![0]).toBeGreaterThan(pts[0]![0]!); // room 0 left of room 1: points right
    const back = renderGraph(normalize(dungeon(2, [[1, 0, true]])), {});
    const bpts = back.match(/<polyline class="oneway" points="([^"]+)"/)![1]!.split(" ").map((p) => p.split(",").map(Number));
    expect(bpts[1]![0]).toBeLessThan(bpts[0]![0]!);
    expect(one).toContain(">one-way</text>");
    expect(one).not.toMatch(/>(gate|secret door|gates)<\/text>/);
    const secret = renderGraph(normalize(dungeon(2, [], [{ between: [0, 1], gate: "secret" }])), {});
    expect(secret).toContain('<path class="edge secret"');
    expect(secret).not.toContain('class="tag"');
    expect(secret).toContain(">secret door</text>");
    expect(secret).not.toContain(">one-way</text>");
  });

  it("titles the sheet with graph in place of the layout seed", () => {
    expect(svg).toContain(`size ${json.size} · seed ${json.seed} · graph`);
    expect(svg).not.toContain("layout ");
  });

  it("escapes every value taken from the JSON", () => {
    const hostile = '"><img src=x onerror=alert(1)>';
    const rooms = new Map([...graph.rooms].map(([id, r]) => [id, { ...r, number: hostile as unknown as number, label: hostile, objects: r.objects.map((o) => ({ ...o, name: hostile })) }]));
    const doors = graph.doors.map((d) => (d.gate && d.gate.kind !== "secret" ? { ...d, gate: { kind: hostile as never, requires: [{ id: "x", type: "key", name: hostile }] } } : d));
    const out = renderGraph({ ...graph, rooms, doors }, { theme: hostile, size: hostile, grammar: hostile });
    expect(out).not.toContain("<img");
    expect(out).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("is deterministic", () => {
    expect(renderGraph(normalize(json), meta)).toBe(svg);
    expect(svg).toMatchSnapshot();
  });
});

describe("drawGraph", () => {
  it("titles from the JSON and counts the rooms", () => {
    const { svg: out, rooms } = drawGraph(json);
    expect(out).toBe(svg);
    expect(rooms).toBe(graph.rooms.size);
  });

  it("draws a non-planar dungeon (K5)", () => {
    const k5: [number, number][] = [];
    for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) k5.push([a, b]);
    const { svg: out } = drawGraph(dungeon(5, k5));
    expect(count(out, /<path class="edge/g)).toBe(10);
    expect(crossings(graphLayout(normalize(dungeon(5, k5))))).toEqual([]);
  });

  it("draws a dungeon that fails to lay out without corridors (bench m-3)", () => {
    const m3 = JSON.parse(readFileSync(join(import.meta.dirname, "..", "bench", "dungeons", "m-3.json"), "utf8")) as DungeonJson;
    expect(count(drawGraph(m3).svg, /<rect class="room"/g)).toBe(normalize(m3).rooms.size);
  });
});
