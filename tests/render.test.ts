import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { defaultConfig } from "../src/engine/config";
import { generate } from "../src/engine/index";
import type { DungeonJson } from "../src/engine/types";
import { polygon, rectangle, type Segment } from "../src/engine/geometry";
import type { Layout } from "../src/engine/layout";
import type { RoomGraph } from "../src/engine/types";
import { role } from "../src/render/neon";
import { scene, type Scene, type SceneRoom } from "../src/render/scene";
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
    expect(draw(json, 3, defaultConfig, "plain")).toEqual({ svg: render(graph, layout, { ...meta, layoutSeed: 3 }), rooms: graph.rooms.size });
  });

  it("picks the style from the theme unless given", () => {
    const { graph, layout } = generate(json, 3, defaultConfig);
    expect(draw(json, 3, defaultConfig).svg).toBe(render(graph, layout, { ...meta, layoutSeed: 3, style: "plain" }));
    expect(draw({ ...json, theme: "cyber" }, 3, defaultConfig).svg).toContain('fill="#0b0814"');
    expect(draw({ ...json, theme: "zelda" }, 3, defaultConfig).svg).toContain('class="hatch"');
  });

  it("leaves an unusable dungeon seed out of the title", () => {
    expect(draw({ ...json, seed: -1 }, 3, defaultConfig).svg).not.toContain("seed -1");
  });

  it("throws the engine's error", () => {
    expect(() => draw({ ...json, schema_version: 3 }, 1, defaultConfig)).toThrow("Unsupported schema_version 3, expected 2");
  });
});

describe("styleFor", () => {
  it("draws cyber neon, zelda Dyson, any other theme or none plain", () => {
    for (const theme of ["cyber", "Cyber"]) expect(styleFor(theme)).toBe("neon");
    for (const theme of ["zelda", "Zelda"]) expect(styleFor(theme)).toBe("dyson");
    for (const theme of ["tor-barrow", "", "constructor", "__proto__", undefined]) expect(styleFor(theme)).toBe("plain");
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

  it("draws one floor per room and corridor, filled, gridded and walled from the same polygons, shaded between", () => {
    expect(n(/<polygon class="floor"/g)).toBe(graph.rooms.size + corridors.size);
    expect(n(/<use href="#floors"/g)).toBe(3);
    expect([...dyson.matchAll(/<use href="#floors" class="(\w+)"|<path class="(shadow)"/g)].map((m) => m[1] ?? m[2])).toEqual(["paper", "grid", "shadow", "wall"]);
    expect(dyson).toContain('<pattern id="grid"');
    expect(dyson).not.toContain('class="room"');
    expect(dyson).not.toContain('class="corridor"');
  });

  it("hatches the rock in one path, under the floors; shades the floors in one path, under the walls", () => {
    expect(n(/<path class="hatch"/g)).toBe(1);
    expect(n(/<path class="shadow" d="M/g)).toBe(1);
    expect(dyson).toContain(".shadow{fill:#999999;stroke:none}");
    expect(dyson.indexOf('class="hatch"')).toBeLessThan(dyson.indexOf('<use href="#floors"'));
  });

  it("draws each door group's symbol at room a's end, an archway at a corridor's room b end", () => {
    const doors = scene(graph, layout).doors;
    const by = (symbol: string) => doors.filter((d) => d.symbol === symbol).length;
    expect(by("lock")).toBe(3);
    expect(by("portcullis")).toBe(1);
    expect(by("secret")).toBe(0); // the fixture has no secret door
    const map = dyson.slice(0, dyson.indexOf('<g transform="translate(')); // the legend draws them too
    const m = (re: RegExp) => map.match(re)?.length ?? 0;
    expect(m(/<rect class="door"/g)).toBe(by("door") + by("lock"));
    expect(m(/<line class="bar"/g)).toBe(by("lock"));
    expect(m(/<circle class="dot"/g)).toBe(3 * by("portcullis"));
    expect(m(/<rect class="gap"/g)).toBe(corridors.size + by("portcullis"));
    expect(n(/<use href="#gaps"/g)).toBe(2);
    for (const text of ["door", "locked door", "portcullis", "gate"]) expect(dyson).toMatch(new RegExp(`<text[^>]*>${text}</text>`));
  });

  it("tags every gate on the map as in the key", () => {
    const tags = [...dyson.matchAll(/<rect class="tag" data-gate="[^"]+"[^>]*\/><text class="tag-letter" [^>]*>([A-Z]+)<\/text>/g)].map((m) => m[1]);
    expect(tags).toHaveLength(4);
    expect(new Set(tags).size).toBe(tags.length);
    expect(n(/data-gate="lock"/g)).toBe(3);
    expect(n(/data-gate="state"/g)).toBe(1);
  });

  // Room 0 above room 1, every door on the shared wall y 3, x 1–2: its middle at 117, 219 px.
  const shape = { id: "rect-3x3", outline: rectangle(3, 3) };
  const two = (doors: RoomGraph["doors"]) =>
    render(
      { rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])), doors, start: 0, goal: 1 },
      { placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 3 } }], doors: doors.map((door) => ({ door, segment: { from: { x: 1, y: 3 }, to: { x: 2, y: 3 } } })) },
      { ...meta, style: "dyson" },
    );
  const legend = (out: string) => [...out.matchAll(/<g transform="translate\([^)]*\)">.*?<\/g>\n<text [^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);

  it("draws a plain door as a rectangle across the wall, half a wall short of each end", () => {
    const out = two([{ a: 0, b: 1, oneway: false }]);
    expect(out).toContain('<rect class="door" x="106.5" y="215" width="21" height="8"/>');
    expect(out).not.toMatch(/class="(gap|bar|dot|secret|oneway|tag)"/);
    expect(legend(out)).toEqual(["start", "goal", "door"]);
  });

  it("bars a locked door, dots a portcullis, both tagged 0.6 unit into room a, off the door", () => {
    const lock = two([{ a: 0, b: 1, oneway: false, gate: { kind: "lock", requires: [] } }]);
    expect(lock).toContain('<rect class="door"');
    expect(lock).toContain('<line class="bar" x1="117" y1="213" x2="117" y2="225"/>');
    expect(lock).toContain('<rect class="tag" data-gate="lock" x="110" y="197.6" width="14" height="14"/>'); // 117, 204.6
    expect(legend(lock)).toEqual(["start", "goal", "locked door", "gate"]);
    const portcullis = two([{ a: 1, b: 0, oneway: false, gate: { kind: "on", requires: [] } }]);
    expect(portcullis).not.toContain('<rect class="door"');
    expect(portcullis).toContain('<rect class="gap"');
    expect(portcullis.match(/<circle class="dot" cx="(111|117|123)" cy="219"/g)).toHaveLength(3);
    expect(portcullis).toContain('<rect class="tag" data-gate="on" x="110" y="226.4" width="14" height="14"/>'); // room a below
    expect(legend(portcullis)).toEqual(["start", "goal", "portcullis", "gate"]);
  });

  it("draws a secret door as an unbroken wall with an S, a one-way door with a chevron on room b's side", () => {
    const secret = two([{ a: 0, b: 1, oneway: false, gate: { kind: "secret", requires: [] } }]);
    expect(secret).not.toMatch(/<rect class="(gap|door)"/);
    expect(secret).toContain('<text class="secret"');
    expect(legend(secret)).toEqual(["start", "goal", "secret door"]);
    const oneway = two([{ a: 0, b: 1, oneway: true }]);
    expect(oneway).toContain('<polyline class="oneway" points="113,231.4 117,235.4 121,231.4"/>'); // down, 0.6 unit below the door
    expect(two([{ a: 1, b: 0, oneway: true }])).toContain('<polyline class="oneway" points="113,206.6 117,202.6 121,206.6"/>'); // up
    expect(legend(oneway)).toEqual(["start", "goal", "door", "one-way"]);
  });

  // Room 1's top wall y 3 (219 px), x 0–3 (81–153 px); shadow 4.2 px wide at the left, 7.3 px high.
  it("leaves a doorway unshaded, a secret door shaded as wall", () => {
    const shadow = (out: string) => out.match(/<path class="shadow" d="([^"]*)"/)![1]!;
    expect(shadow(two([{ a: 0, b: 1, oneway: false }]))).toContain("M85.2 219H109.2V226.3H85.2ZM133.2 219H153V226.3H133.2Z"); // jamb shaded, door not
    expect(shadow(two([{ a: 0, b: 1, oneway: false, gate: { kind: "secret", requires: [] } }]))).toContain("M85.2 219H153V226.3H85.2Z");
  });

  it("puts a corridor's door symbol and tag at room a's end, an archway and the chevron at room b's", () => {
    const g: RoomGraph = { rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])), doors: [{ a: 0, b: 1, oneway: true, gate: { kind: "lock", requires: [] } }], start: 0, goal: 1 };
    const l: Layout = {
      placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 4 } }],
      doors: [{ door: g.doors[0]!, segment: { from: { x: 1, y: 3 }, to: { x: 2, y: 3 } }, corridor: { shape: { id: "corridor-v1", outline: rectangle(1, 1) }, at: { x: 1, y: 3 }, segment: { from: { x: 1, y: 4 }, to: { x: 2, y: 4 } } } }],
    };
    const out = render(g, l, { ...meta, style: "dyson" });
    expect(out.match(/<rect class="door" x="106.5" y="215"/g)).toHaveLength(1); // room a's end, y 3
    expect(out.match(/<rect class="gap" x="106.5" y="240.5"/g)).toHaveLength(1); // room b's end, y 4
    expect(out).toContain('<rect class="tag" data-gate="lock" x="110" y="197.6"');
    expect(out).toContain('<polyline class="oneway" points="113,231.4 117,235.4 121,231.4"/>'); // in the corridor
    expect(out.match(/<path class="shadow" d="([^"]*)"/)![1]).toContain("M85.2 243H109.2V250.3H85.2ZM133.2 243H153V250.3H133.2Z"); // room b's end open too
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

  it("wobbles the floors, more points than corners", () => {
    const pts = [...dyson.matchAll(/<polygon class="floor" points="([^"]+)"/g)].flatMap((m) => m[1]!.split(" "));
    expect(pts.some((p) => p.includes("."))).toBe(true);
    expect(pts.length).toBeGreaterThan(2 * 4 * (graph.rooms.size + corridors.size)); // every floor at least twice its corners
  });

  it("uses ink, paper, the grid and shadow colours only, in a serif", () => {
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

describe("neon", () => {
  const neon = render(graph, layout, { ...meta, style: "neon" });
  const n = (re: RegExp) => neon.match(re)?.length ?? 0;
  const corridors = new Set(layout.doors.flatMap(({ corridor: c }) => (c ? [`${c.shape.id}@${c.at.x},${c.at.y}`] : [])));
  const s = scene(graph, layout);

  it("is a standalone svg on the indigo-black page, without filters", () => {
    expect(neon).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" [^>]*viewBox="0 0 \d+ \d+"/);
    expect(neon.endsWith("</svg>")).toBe(true);
    expect(neon).toMatch(/<rect width="\d+" height="\d+" fill="#0b0814"\/>/);
    expect(neon).not.toContain("<filter");
  });

  it("draws one outline per room, used for three glows, then a fill, then a wall; every glow under every corridor and fill", () => {
    expect(n(/<polygon id="room-\d+"/g)).toBe(graph.rooms.size);
    expect(n(/<polygon class="corridor"/g)).toBe(corridors.size);
    const uses = [...neon.matchAll(/<use href="#room-\d+" class="(\w+) r-[\w-]+"/g)].map((m) => m[1]);
    const r = graph.rooms.size;
    expect(uses).toEqual(["glow0", "glow1", "glow2", "fill", "wall"].flatMap((c) => Array(r).fill(c)));
    expect(neon.lastIndexOf('<use href="#room-0" class="glow2')).toBeLessThan(neon.indexOf('<polygon class="corridor"'));
    expect(neon.lastIndexOf('<polygon class="corridor"')).toBeLessThan(neon.indexOf('<use href="#room-0" class="fill'));
  });

  it("colours each room by its role", () => {
    for (const [i, room] of s.rooms.entries()) expect(n(new RegExp(`<use href="#room-${i}" class="\\w+ r-${role(room, s)}"`, "g"))).toBe(5);
    expect(neon).toContain(".r-start{fill:#0f4a5a;stroke:#19e3ff}");
    expect(neon).toContain(".r-goal{fill:#6d1662;stroke:#ff2bd6}");
  });

  const map = neon.slice(0, neon.indexOf('<text class="heading"')); // the key draws tags and the legend symbols too
  const m = (re: RegExp) => map.match(re)?.length ?? 0;

  it("draws each door group's symbol at room a's end, an archway at a corridor's room b end", () => {
    const by = (symbol: string) => s.doors.filter((d) => d.symbol === symbol).length;
    expect(by("lock")).toBe(3);
    expect(by("portcullis")).toBe(1);
    expect(m(/<rect class="door"/g)).toBe(by("door") + by("lock"));
    expect(m(/<line class="bar"/g)).toBe(by("lock"));
    expect(m(/<circle class="dot"/g)).toBe(3 * by("portcullis"));
    expect(m(/<text class="secret"/g)).toBe(s.doors.filter((d) => d.secret).reduce((k, d) => k + (d.corridor ? 2 : 1), 0));
    expect(m(/<rect class="gap"/g)).toBe(s.doors.filter((d) => d.corridor && !d.secret).length + by("portcullis"));
    expect(neon).not.toMatch(/class="(jamb|dash)"|gap-corridor/);
    for (const text of ["door", "locked door", "portcullis", "gate"]) expect(neon).toMatch(new RegExp(`<text[^>]*>${text}</text>`));
  });

  it("tags every gate beside its door, as in the key", () => {
    const tags = [...map.matchAll(/<rect class="tag" data-gate="[^"]+"[^>]*\/><text class="tag-letter" [^>]*>([A-Z]+)<\/text>/g)].map((t) => t[1]);
    expect(tags).toEqual(["A", "B", "C", "D"]);
  });

  it("paints walls, gaps, symbols, tags and chevrons, then numbers, in that order", () => {
    const first = (re: RegExp) => map.search(re);
    const last = (re: RegExp) => {
      const at = [...map.matchAll(new RegExp(re, "g"))].map((x) => x.index!);
      expect(at.length).toBeGreaterThan(0); // else -Infinity passes every comparison
      return Math.max(...at);
    };
    const symbol = /<rect class="door"|<line class="bar"|<circle class="dot"|<text class="secret"/;
    expect(last(/<use href="#room-\d+" class="wall/)).toBeLessThan(first(/<rect class="gap"/));
    expect(last(/<rect class="gap"/)).toBeLessThan(first(symbol));
    expect(last(symbol)).toBeLessThan(first(/<rect class="tag"/));
    expect(last(/<rect class="tag"/)).toBeLessThan(first(/<text class="number"/));
  });

  // Room 0 above room 1, every door on the shared wall y 3, x 1–2: 81–105 px at 195 px, middle 93.
  const shape = { id: "rect-3x3", outline: rectangle(3, 3) };
  const two = (doors: RoomGraph["doors"]) =>
    render(
      { rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])), doors, start: 0, goal: 1 },
      { placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 3 } }], doors: doors.map((door) => ({ door, segment: { from: { x: 1, y: 3 }, to: { x: 2, y: 3 } } })) },
      { ...meta, style: "neon" },
    );
  const legend = (out: string) => [...out.matchAll(/<g transform="translate\([^)]*\)">.*?<\/g>\n<text [^>]*>([^<]+)<\/text>/g)].map((x) => x[1]);

  it("draws a plain door as a rectangle across the 2 px wall, a wall short of the segment", () => {
    const out = two([{ a: 0, b: 1, oneway: false }]);
    expect(out).toContain('<rect class="door" x="82" y="191" width="22" height="8"/>');
    expect(out).not.toMatch(/class="(gap|bar|dot|secret|oneway|tag)"/);
    expect(legend(out)).toEqual(["start", "goal", "start room", "goal room", "door"]);
  });

  it("bars a locked door, dots a portcullis in a gap, both tagged 0.6 unit into room a, off the door", () => {
    const lock = two([{ a: 0, b: 1, oneway: false, gate: { kind: "lock", requires: [] } }]);
    expect(lock).toContain('<rect class="door" x="82" y="191"');
    expect(lock).toContain('<line class="bar" x1="93" y1="189" x2="93" y2="201"/>');
    expect(lock).toContain('<rect class="tag" data-gate="lock" x="86" y="173.6" width="14" height="14"/>'); // 93, 180.6
    expect(legend(lock)).toEqual(["start", "goal", "start room", "goal room", "locked door", "gate"]);
    const portcullis = two([{ a: 1, b: 0, oneway: false, gate: { kind: "on", requires: [] } }]);
    expect(portcullis).not.toContain('<rect class="door"');
    expect(portcullis).toContain('<rect class="gap" x="82" y="193" width="22" height="4"/>');
    expect(portcullis.match(/<circle class="dot" cx="(87|93|99)" cy="195"/g)).toHaveLength(3);
    expect(portcullis).toContain('<rect class="tag" data-gate="on" x="86" y="202.4" width="14" height="14"/>'); // room a below
    expect(legend(portcullis)).toEqual(["start", "goal", "start room", "goal room", "portcullis", "gate"]);
  });

  it("draws a secret door as an S on the unbroken wall, a one-way door with a chevron on room b's side", () => {
    const secret = two([{ a: 0, b: 1, oneway: false, gate: { kind: "secret", requires: [] } }]);
    expect(secret).not.toMatch(/<rect class="(gap|door)"/);
    expect(secret).toContain('<text class="secret" x="93" y="199.5">S</text>');
    expect(legend(secret)).toEqual(["start", "goal", "start room", "goal room", "secret door"]);
    const oneway = two([{ a: 0, b: 1, oneway: true }]);
    expect(oneway).toContain('<polyline class="oneway" points="89,207.4 93,211.4 97,207.4"/>'); // down, 0.6 unit below the door
    expect(two([{ a: 1, b: 0, oneway: true }])).toContain('<polyline class="oneway" points="89,182.6 93,178.6 97,182.6"/>'); // up
    expect(legend(oneway)).toEqual(["start", "goal", "start room", "goal room", "door", "one-way"]);
  });

  it("puts a corridor's door symbol and tag at room a's end, an archway and the chevron at room b's", () => {
    const g: RoomGraph = { rooms: new Map([0, 1].map((id) => [id, { id, type: "n", number: id + 1, label: `R${id}`, objects: [] }])), doors: [{ a: 0, b: 1, oneway: true, gate: { kind: "lock", requires: [] } }], start: 0, goal: 1 };
    const l: Layout = {
      placements: [{ room: 0, shape, at: { x: 0, y: 0 } }, { room: 1, shape, at: { x: 0, y: 4 } }],
      doors: [{ door: g.doors[0]!, segment: { from: { x: 1, y: 3 }, to: { x: 2, y: 3 } }, corridor: { shape: { id: "corridor-v1", outline: rectangle(1, 1) }, at: { x: 1, y: 3 }, segment: { from: { x: 1, y: 4 }, to: { x: 2, y: 4 } } } }],
    };
    const out = render(g, l, { ...meta, style: "neon" });
    expect(out.match(/<rect class="door" x="82" y="191"/g)).toHaveLength(1); // room a's end, y 3
    expect(out.match(/<rect class="gap" x="82" y="217"/g)).toHaveLength(1); // room b's end, y 4
    expect(out).toContain('<rect class="tag" data-gate="lock" x="86" y="173.6"');
    expect(out).toContain('<polyline class="oneway" points="89,207.4 93,211.4 97,207.4"/>'); // in the corridor
    expect(legend(out)).toEqual(["start", "goal", "start room", "goal room", "corridor", "locked door", "one-way", "gate"]);
  });

  it("lists no door symbol in the legend without doors", () => {
    expect(legend(two([]))).toEqual(["start", "goal", "start room", "goal room"]);
  });

  it("lists the roles drawn in the legend, not the other tones", () => {
    const legend = [...neon.matchAll(/<g transform="translate\([^)]*\)">.*?<\/g>\n<text [^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    const order = ["start", "goal", "boss", "pickup", "treasure"];
    const drawn = order.filter((r) => s.rooms.some((room) => role(room, s) === r)).map((r) => `${r} room`);
    expect(drawn.length).toBeGreaterThan(2);
    expect(legend.filter((l) => l!.endsWith(" room"))).toEqual(drawn);
    expect(legend).toContain("corridor");
  });

  it("numbers every room and lists every label once, escaped", () => {
    for (const room of graph.rooms.values()) {
      expect(n(new RegExp(`<text class="number" data-room="${room.number}"`, "g"))).toBe(1);
      expect(n(new RegExp(`data-key="${room.number}"`, "g"))).toBe(1);
    }
    const hostile = '"><img src=x onerror=alert(1)>';
    const rooms = new Map([...graph.rooms].map(([id, r]) => [id, { ...r, type: hostile, number: hostile as unknown as number, label: hostile }]));
    const doors = layout.doors.map((d) => (d.door.gate ? { ...d, door: { ...d.door, gate: { ...d.door.gate, kind: hostile as never } } } : d));
    const out = render({ ...graph, rooms }, { ...layout, doors }, { ...meta, style: "neon" });
    expect(out).not.toContain("<img");
  });

  it("uses the neon tokens in a monospace, none of the other styles' colours", () => {
    expect(neon).not.toMatch(/#f0a000|#e5e5e5|#f6f8f7|#b2b2b2|#ffffff|#000000|#999999/i);
    expect(neon).toMatch(/text\{font-family:'DejaVu Sans Mono'.*monospace;font-size:12px;fill:#eef2ff\}/);
    expect(neon).toContain(".tag{fill:#0b0814;stroke:#ffd23f;stroke-width:1}");
    expect(neon).toContain(".door{fill:#0b0814;stroke:#eef2ff;stroke-width:1.5}");
  });

  it("is deterministic", () => {
    expect(render(graph, layout, { ...meta, style: "neon" })).toBe(neon);
    expect(neon).toMatchSnapshot();
  });
});

describe("role", () => {
  const room = (type: string, number = 1, id = 5): SceneRoom => ({ id, number, type, outline: [], anchor: { x: 0, y: 0 }, glyphs: [] });
  const s = { start: 0, goal: 1 } as Scene;

  it("follows the role table of docs/neon-style.md", () => {
    const cases: [string, string][] = [
      ["st", "start"], ["exit", "start"], ["gl", "goal"], ["eb", "boss"], ["em", "boss"],
      ["key", "pickup"], ["bosskey", "pickup"], ["item", "pickup"], ["switch", "pickup"], ["lever", "pickup"],
      ["gb: bombs", "treasure"], ["gb:x", "treasure"], ["gb", "treasure"],
    ];
    for (const [type, r] of cases) expect(role(room(type), s)).toBe(r);
  });

  it("makes the start and goal rooms start and goal whatever their type", () => {
    expect(role(room("n", 1, 0), s)).toBe("start");
    expect(role(room("em", 1, 1), s)).toBe("goal");
  });

  it("spreads every other room over three tones by number", () => {
    for (const type of ["n", "p", "c", "e", "t", "gbx", "toString", ""]) expect(role(room(type, 7), s)).toBe("other-1");
    expect([3, 4, 5].map((k) => role(room("n", k), s))).toEqual(["other-0", "other-1", "other-2"]);
  });
});
