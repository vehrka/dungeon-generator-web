import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { defaultConfig } from "../src/engine/config";
import { generate } from "../src/engine/index";
import type { DungeonJson } from "../src/engine/types";
import { polygon, rectangle, type Segment } from "../src/engine/geometry";
import type { Layout } from "../src/engine/layout";
import type { RoomGraph } from "../src/engine/types";
import { draw, render, styleFor } from "../src/render/svg";

const json = ruin as DungeonJson;
const meta = { seed: json.seed, layoutSeed: json.seed, theme: json.theme, size: json.size, grammar: json.grammar };
const { graph, layout } = generate(json, json.seed, defaultConfig);
const svg = render(graph, layout, meta);
const count = (re: RegExp) => svg.match(re)?.length ?? 0;

describe("render", () => {
  it("is a standalone svg", () => {
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" [^>]*viewBox="0 0 \d+ \d+"/);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("draws one polygon per room and every number in it", () => {
    expect(count(/<polygon class="room"/g)).toBe(graph.rooms.size);
    for (const room of graph.rooms.values()) {
      expect(svg).toContain(`<text class="number" data-room="${room.number}"`);
    }
  });

  it("lists every room label once in the key, escaped", () => {
    for (const room of graph.rooms.values()) {
      expect(svg).toContain(`data-key="${room.number}"`);
    }
    expect(svg).toContain("Grass-grown portal (START)");
    const escaped = render({ ...graph, rooms: new Map([...graph.rooms].map(([id, r]) => [id, { ...r, label: "a < b & c" }])) }, layout, meta);
    expect(escaped).toContain("a &lt; b &amp; c");
    expect(escaped).not.toContain("a < b");
  });

  it("escapes room numbers and gate kinds, which the JSON does not type-check", () => {
    const hostile = '"><img src=x onerror=alert(1)>';
    const rooms = new Map([...graph.rooms].map(([id, r]) => [id, { ...r, number: hostile as unknown as number }]));
    const doors = layout.doors.map((d) => (d.door.gate ? { ...d, door: { ...d.door, gate: { ...d.door.gate, kind: hostile as never } } } : d));
    const out = render({ ...graph, rooms }, { ...layout, doors }, meta);
    expect(out).not.toContain("<img");
    expect(out).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  it("draws one polygon per corridor", () => {
    const corridors = new Set(layout.doors.flatMap(({ corridor: c }) => (c ? [`${c.shape.id}@${c.at.x},${c.at.y}`] : [])));
    expect(corridors.size).toBeGreaterThan(0);
    expect(count(/<polygon class="corridor"/g)).toBe(corridors.size);
    const direct = generate(json, json.seed, { ...defaultConfig, corridors: false });
    expect(render(direct.graph, direct.layout, meta)).not.toMatch(/class="(corridor|gap-corridor)"/);
    expect(count(/class="gap-corridor"/g)).toBe(2 * corridors.size); // both ends of every corridor
  });

  it("marks every door, both ends of a corridor, tags gates and points one-way doors", () => {
    const key = (s: Segment) => `${s.from.x},${s.from.y},${s.to.x},${s.to.y}`;
    const segments = new Set(layout.doors.flatMap((d) => (d.corridor ? [key(d.segment), key(d.corridor.segment)] : [key(d.segment)])));
    expect(count(/<g class="door/g)).toBe(segments.size);
    expect(count(/<g class="door[^"]*gated/g)).toBe(4); // 3 lock, 1 state
    expect(count(/data-gate="lock"/g)).toBe(3);
    expect(count(/data-gate="state"/g)).toBe(1);
    expect(count(/<g class="door[^>]*>(?:(?!<\/g>).)*class="oneway"/g)).toBe(layout.doors.filter((d) => d.door.oneway).length);
  });

  it("points a one-way chevron from room a to room b", () => {
    // Room 0 above room 1, door x 1–2, y 3 on the grid: centre 33 + 1.5·24 = 69, 33 + 66 + 3·24 = 171 px.
    const two = (a: number, b: number): RoomGraph => ({
      rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])),
      doors: [{ a, b, oneway: true }],
      start: 0,
      goal: 1,
    });
    const shape = { id: "rect-3x3", outline: rectangle(3, 3) };
    const l = (g: RoomGraph): Layout => ({
      placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 3 } }],
      doors: [{ door: g.doors[0]!, segment: { from: { x: 1, y: 3 }, to: { x: 2, y: 3 } } }],
    });
    const chevron = (g: RoomGraph) => render(g, l(g), meta).match(/<polyline class="oneway" points="([^"]+)"/)![1];
    expect(chevron(two(0, 1))).toBe("65,169 69,173 73,169"); // down, into room 1
    expect(chevron(two(1, 0))).toBe("65,173 69,169 73,173"); // up, into room 0
  });

  it("points the chevron by the side room a is on, not its bounding box", () => {
    // L room 0 with its top-right block cut out; room 1 sits in the cut, door on the inner wall
    // y 7, x 5–6. Room 0 is below the door, its bounding-box centre (y 5) above it.
    const g: RoomGraph = {
      rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])),
      doors: [{ a: 0, b: 1, oneway: true }],
      start: 0,
      goal: 1,
    };
    const l: Layout = {
      placements: [
        { room: 0, shape: { id: "l", outline: polygon([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 7 }, { x: 10, y: 7 }, { x: 10, y: 10 }, { x: 0, y: 10 }]) }, at: { x: 0, y: 0 } },
        { room: 1, shape: { id: "rect-3x3", outline: rectangle(3, 3) }, at: { x: 5, y: 4 } },
      ],
      doors: [{ door: g.doors[0]!, segment: { from: { x: 5, y: 7 }, to: { x: 6, y: 7 } } }],
    };
    expect(render(g, l, meta)).toContain(`<polyline class="oneway" points="161,269 165,265 169,269"/>`); // up, into room 1
  });

  it("puts the number in the middle of the longest arm of a lying L", () => {
    // bar 10×3 along the top, arm 3×2 down the left: column slabs would cut the bar at x 3
    const g: RoomGraph = { rooms: new Map([[0, { id: 0, type: "n", number: 1, label: "R0", objects: [] }]]), doors: [], start: 0, goal: 0 };
    const outline = polygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 5 }, { x: 0, y: 5 }]);
    const l: Layout = { placements: [{ room: 0, shape: { id: "l", outline }, at: { x: 0, y: 0 } }], doors: [] };
    // bar centre (5, 1.5): x 33 + 5·24, y 33 + 66 + 1.5·24, 1 up for the start and goal glyphs
    expect(render(g, l, meta)).toContain(`<text class="number" data-room="1" x="153" y="134"`);
  });

  it("tags a corridor's gate and one-way at room a's end, a plain door at room b's", () => {
    const shape = { id: "rect-3x3", outline: rectangle(3, 3) };
    const g: RoomGraph = {
      rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])),
      doors: [{ a: 0, b: 1, oneway: true, gate: { kind: "lock", requires: [] } }],
      start: 0,
      goal: 1,
    };
    const v1 = { id: "corridor-v1", outline: rectangle(1, 1) };
    const l: Layout = {
      placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 4 } }],
      doors: [
        {
          door: g.doors[0]!,
          segment: { from: { x: 1, y: 3 }, to: { x: 2, y: 3 } },
          corridor: { shape: v1, at: { x: 1, y: 3 }, segment: { from: { x: 1, y: 4 }, to: { x: 2, y: 4 } } },
        },
      ],
    };
    const out = render(g, l, meta);
    expect(out.match(/<polygon class="corridor"/g)).toHaveLength(1);
    const marks = out.match(/<g class="door[^>]*>.*?<\/g>/g)!;
    expect(marks).toHaveLength(2);
    expect(marks[0]).toMatch(/gated.*data-gate="lock".*class="oneway"/);
    expect(marks[1]).not.toMatch(/gated|tag|oneway/);
    expect(marks[1]).toContain('y1="192"'); // jamb on y 4: 33 + 66 + 4·24 = 195 px, − 3
    // the corridor halves of both gaps are grey: below the door on y 3 (171 px), above y 4
    expect(marks[0]).toContain('<rect class="gap-corridor" x="58" y="171.5" width="22" height="1.5"/>');
    expect(marks[1]).toContain('<rect class="gap-corridor" x="58" y="193" width="22" height="1.5"/>');
    expect(out).toMatch(/<rect class="corridor"[^>]*\/><\/g>\n<text[^>]*>corridor<\/text>/); // legend
  });

  it("marks a shared door segment by what all its doors have in common", () => {
    const shape = { id: "rect-3x3", outline: rectangle(3, 3) };
    const mark = (doors: RoomGraph["doors"]) => {
      const g: RoomGraph = {
        rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])),
        doors,
        start: 0,
        goal: 1,
      };
      const segment = { from: { x: 1, y: 3 }, to: { x: 2, y: 3 } };
      const l: Layout = {
        placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 3 } }],
        doors: doors.map((door) => ({ door, segment })),
      };
      return render(g, l, meta);
    };
    const door = (doors: RoomGraph["doors"]) => mark(doors).match(/<g class="door[^>]*>.*?<\/g>/)![0];
    const legend = (doors: RoomGraph["doors"]) => [...mark(doors).matchAll(/<text x="\d+" y="\d+">(secret door|one-way)<\/text>/g)].map((m) => m[1]);
    const secret = { kind: "secret" as const, requires: [] };
    expect(door([{ a: 0, b: 1, oneway: true }, { a: 0, b: 1, oneway: true }])).toContain("oneway");
    expect(door([{ a: 0, b: 1, oneway: true }, { a: 0, b: 1, oneway: false }])).not.toContain("oneway");
    expect(door([{ a: 0, b: 1, oneway: true }, { a: 1, b: 0, oneway: true }])).not.toContain("oneway");
    expect(door([{ a: 0, b: 1, oneway: false, gate: secret }])).toContain("dash");
    expect(door([{ a: 0, b: 1, oneway: false, gate: secret }, { a: 0, b: 1, oneway: false }])).not.toContain("dash");
    // the legend lists only the marks drawn
    expect(legend([{ a: 0, b: 1, oneway: true, gate: secret }])).toEqual(["secret door", "one-way"]);
    expect(legend([{ a: 0, b: 1, oneway: true, gate: secret }, { a: 0, b: 1, oneway: false }])).toEqual([]);
  });

  it("is wide enough for the title", () => {
    const wide = render(graph, layout, { ...meta, theme: "x".repeat(300) });
    expect(Number(wide.match(/width="(\d+)"/)![1])).toBeGreaterThanOrEqual(33 + 300 * 7.5);
  });

  it("names the gate objects in the key", () => {
    for (const { door } of layout.doors) {
      for (const o of door.gate?.requires ?? []) expect(svg).toContain(o.name);
    }
  });

  it("shows the room objects, start and goal as glyphs", () => {
    expect(count(/<use href="#glyph-start"/g)).toBeGreaterThanOrEqual(1);
    expect(count(/<use href="#glyph-goal"/g)).toBeGreaterThanOrEqual(1);
    for (const type of ["key", "bosskey", "item", "switch", "treasure"]) {
      expect(svg).toContain(`<use href="#glyph-${type}"`);
    }
  });

  it("titles the map with theme, size and seeds", () => {
    expect(svg).toContain("tor-barrow");
    expect(svg).toMatch(/size L/);
    expect(svg).toMatch(/seed 444/);
    expect(svg).toMatch(/layout 444/);
  });

  it("is deterministic", () => {
    expect(render(graph, layout, meta)).toBe(svg);
    expect(svg).toMatchSnapshot();
  });
});

describe("draw", () => {
  it("equals render over generate, titled from the JSON, with the room count", () => {
    const { graph, layout } = generate(json, 3, defaultConfig);
    expect(draw(json, 3, defaultConfig, "catalogue")).toEqual({ svg: render(graph, layout, { ...meta, layoutSeed: 3 }), rooms: graph.rooms.size });
  });

  it("picks the style from the theme unless given", () => {
    const { graph, layout } = generate(json, 3, defaultConfig);
    expect(draw(json, 3, defaultConfig).svg).toBe(render(graph, layout, { ...meta, layoutSeed: 3, style: "dyson" }));
    expect(draw({ ...json, theme: "cyber" }, 3, defaultConfig).svg).toContain('class="room"');
  });

  it("leaves an unusable dungeon seed out of the title", () => {
    expect(draw({ ...json, seed: -1 }, 3, defaultConfig).svg).not.toContain("seed -1");
  });

  it("throws the engine's error", () => {
    expect(() => draw({ ...json, schema_version: 3 }, 1, defaultConfig)).toThrow("Unsupported schema_version 3, expected 2");
  });
});

describe("styleFor", () => {
  it("draws cyber as a catalogue, any other theme or none Dyson", () => {
    expect(styleFor("cyber")).toBe("catalogue");
    for (const theme of ["zelda", "tor-barrow", "", undefined]) expect(styleFor(theme)).toBe("dyson");
  });
});

describe("dyson", () => {
  const dyson = render(graph, layout, { ...meta, style: "dyson" });
  const n = (re: RegExp) => dyson.match(re)?.length ?? 0;
  const corridors = new Set(layout.doors.flatMap(({ corridor: c }) => (c ? [`${c.shape.id}@${c.at.x},${c.at.y}`] : [])));

  it("is a standalone svg on white paper", () => {
    expect(dyson).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" [^>]*viewBox="0 0 \d+ \d+"/);
    expect(dyson.endsWith("</svg>")).toBe(true);
    expect(dyson).toMatch(/<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
  });

  it("draws one floor per room and corridor, filled, gridded and walled from the same polygons", () => {
    expect(n(/<polygon class="floor"/g)).toBe(graph.rooms.size + corridors.size);
    expect(n(/<use href="#floors"/g)).toBe(3);
    expect(dyson).toContain('<pattern id="grid"');
    expect(dyson).not.toContain('class="room"');
    expect(dyson).not.toContain('class="corridor"');
  });

  it("hatches the rock in one path, under the floors", () => {
    expect(n(/<path class="hatch"/g)).toBe(1);
    expect(dyson.indexOf('class="hatch"')).toBeLessThan(dyson.indexOf('<use href="#floors"'));
  });

  it("cuts a gap in the wall at every door and both ends of every corridor", () => {
    const groups = new Set(layout.doors.map((d) => (d.corridor ? `${d.corridor.shape.id}@${d.corridor.at.x},${d.corridor.at.y}` : `${d.segment.from.x},${d.segment.from.y},${d.segment.to.x},${d.segment.to.y}`)));
    expect(n(/<rect class="gap"/g)).toBe(groups.size + corridors.size);
  });

  it("numbers every room and lists every label once, escaped", () => {
    for (const room of graph.rooms.values()) {
      expect(n(new RegExp(`<text class="number" data-room="${room.number}"`, "g"))).toBe(1);
      expect(n(new RegExp(`data-key="${room.number}"`, "g"))).toBe(1);
    }
    const hostile = '"><img src=x onerror=alert(1)>';
    const rooms = new Map([...graph.rooms].map(([id, r]) => [id, { ...r, number: hostile as unknown as number, label: hostile }]));
    const doors = layout.doors.map((d) => (d.door.gate ? { ...d, door: { ...d.door, gate: { ...d.door.gate, kind: hostile as never } } } : d));
    const out = render({ ...graph, rooms }, { ...layout, doors }, { ...meta, style: "dyson" });
    expect(out).not.toContain("<img");
  });

  it("uses ink, paper and the grid colour only, in a serif", () => {
    expect(dyson).not.toMatch(/#f0a000|#e5e5e5|#f6f8f7|#b2b2b2/i);
    expect(dyson).toMatch(/text\{font-family:'Palatino Linotype'.*serif;/);
    expect(dyson).toContain('<use href="#glyph-start"');
  });

  it("keeps the hatching inside the page", () => {
    const [w, h] = dyson.match(/viewBox="0 0 (\d+) (\d+)"/)!.slice(1).map(Number) as [number, number];
    const coords = dyson.match(/<path class="hatch" d="([^"]+)"/)![1]!.match(/-?[\d.]+/g)!.map(Number);
    for (let i = 0; i < coords.length; i += 2) {
      expect(coords[i]).toBeGreaterThanOrEqual(0);
      expect(coords[i]).toBeLessThanOrEqual(w);
      expect(coords[i + 1]).toBeGreaterThanOrEqual(0);
      expect(coords[i + 1]).toBeLessThanOrEqual(h);
    }
  });

  it("is deterministic, the layout seed driving the hatching", () => {
    expect(render(graph, layout, { ...meta, style: "dyson" })).toBe(dyson);
    expect(render(graph, layout, { ...meta, style: "dyson", layoutSeed: 1 })).not.toBe(dyson);
    expect(dyson).toMatchSnapshot();
  });
});
