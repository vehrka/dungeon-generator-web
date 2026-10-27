import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { defaultConfig } from "../src/engine/config";
import { generate } from "../src/engine/index";
import type { DungeonJson } from "../src/engine/types";
import { rectangle } from "../src/engine/geometry";
import type { Layout } from "../src/engine/layout";
import type { RoomGraph } from "../src/engine/types";
import { render } from "../src/render/svg";

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

  it("marks every door, tags gates and points one-way doors", () => {
    const segments = new Set(layout.doors.map(({ segment: s }) => `${s.from.x},${s.from.y},${s.to.x},${s.to.y}`));
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
