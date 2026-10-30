import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GRAMMAR, PACING, PRESETS } from "../src/engine/generator/grammar";
import type { Point } from "../src/engine/geometry";
import { graphLayout, type GraphEdge, type GraphLayout } from "../src/render/graph";
import { renderGrammar, sizeStats, variantGraph, variantLook } from "../src/render/grammar";

const variants = Object.entries(GRAMMAR).flatMap(([symbol, rule]) => rule.variants.map((v) => ({ symbol, rule, v })));
const sheet = renderGrammar();
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

// Every point of the edge, every 2 px (as tests/graph.test.ts).
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
        if (b.x + 0.5 < p.x && p.x < b.x + b.w - 0.5 && b.y + 0.5 < p.y && p.y < b.y + b.h - 0.5) out.push(`${e.a}-${e.b} through ${b.id}`);
  return [...new Set(out)];
}

describe("variantGraph", () => {
  it("builds every variant, prev as start and next as goal, a branch rule's goal its start", () => {
    for (const { symbol, rule, v } of variants) {
      const g = variantGraph(symbol, v);
      const named = (label: string) => [...g.rooms.values()].filter((r) => r.label === label).map((r) => r.id);
      expect(g.rooms.size, `${symbol} ${v.name}`).toBe(v.nodes.length + (rule.branch ? 1 : 2));
      if (symbol === "Start") expect([named("START"), named("GOAL")]).toEqual([[g.start], [g.goal]]);
      else expect(g.goal === g.start, `${symbol} ${v.name}`).toBe(rule.branch);
      expect(g.rooms.get(g.start)!.type).toBe(symbol === "Start" ? "st" : "prev");
      expect(g.doors).toHaveLength(v.edges.length);
    }
  });

  it("labels non-terminals K(), rooms by code, items and switches by object name, anchors blank", () => {
    const g = variantGraph("K", GRAMMAR.K!.variants[0]!);
    expect([...g.rooms.values()].map((r) => r.label)).toEqual(["", "n", "L()", "small key", "R()", ""]);
    const tg = variantGraph("TG", GRAMMAR.TG!.variants[0]!);
    expect([...tg.rooms.values()].find((r) => r.type === "lever")!.label).toBe("lever");
    expect(variantGraph("E", GRAMMAR.E!.variants[1]!).rooms.get(4)!.label).toBe("EXIT");
  });

  it("carries gate kinds, their objects and one-way paths", () => {
    const kinds = (symbol: string, i: number) => variantGraph(symbol, GRAMMAR[symbol]!.variants[i]!).doors.flatMap((d) => (d.gate ? [d.gate.kind] : []));
    expect(kinds("TG", 0)).toEqual(["on", "off"]);
    expect(kinds("H", 1)).toEqual(["secret"]);
    const sw = variantGraph("SW", GRAMMAR.SW!.variants[1]!).doors.find((d) => d.gate)!;
    expect(sw.gate!.requires).toEqual([{ id: "s1", type: "switch", name: "switch" }, { id: "s2", type: "switch", name: "switch" }]);
    expect(variantGraph("L", GRAMMAR.L!.variants[7]!).doors.filter((d) => d.oneway)).toHaveLength(3);
  });
});

describe("graphLayout across", () => {
  it("lays every variant's layers out left to right, no edge through a box", () => {
    for (const { symbol, v } of variants) {
      const g = variantGraph(symbol, v);
      const l = graphLayout(g, { across: true, look: variantLook(g) });
      const boxes = [...l.boxes.values()];
      for (const a of boxes) for (const b of boxes) if (a.layer < b.layer) expect(a.x + a.w, `${symbol} ${v.name}`).toBeLessThan(b.x);
      expect(crossings(l), `${symbol} ${v.name}`).toEqual([]);
    }
  });
});

describe("renderGrammar", () => {
  it("draws one card per rule, one row per variant", () => {
    expect(sheet).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" [^>]*viewBox="0 0 \d+ \d+"/);
    expect(sheet).toContain("Combined dungeon grammar");
    for (const [symbol, rule] of Object.entries(GRAMMAR)) {
      expect(count(sheet, new RegExp(`data-rule="${symbol}"`)), symbol).toBe(1);
      expect(count(sheet, new RegExp(`data-variant="${symbol} `, "g")), symbol).toBe(rule.variants.length);
    }
  });

  it("writes each preset's d20 range as a-b, a or a dash", () => {
    const row = (symbol: string, name: string) => sheet.match(new RegExp(`<g data-variant="${symbol} ${name}">(.*?)</g>`, "s"))![1]!;
    const ranges = (symbol: string, name: string) => [...row(symbol, name).matchAll(/<text class="range"[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(ranges("L", "switch")).toEqual(["18", "18", "15", "13-14"]);
    expect(ranges("L", "toggle")).toEqual(["—", "—", "16", "15"]);
    expect(ranges("Start", "boss only")).toEqual(["1-20", "—", "—", "—"]);
  });

  it("gives R the pacing tiers, not the presets", () => {
    const card = sheet.match(/<g data-rule="R">(.*?)<\/g>\n<g data-rule/s)![1]!;
    for (const tier of ["early", "middle", "late"]) expect(card).toContain(`>${tier}</text>`);
    expect(card).not.toContain(">XS</text>");
    const nothing = card.match(/<g data-variant="R nothing">(.*?)<\/g>/s)![1]!;
    expect([...nothing.matchAll(/<text class="range"[^>]*>([^<]*)</g)].map((m) => m[1])).toEqual(PACING.map(([, r]) => (r.nothing![0] === r.nothing![1] ? `${r.nothing![0]}` : `${r.nothing![0]}-${r.nothing![1]}`)));
  });

  it("lists every node and edge kind the grammar uses in the legend", () => {
    const nodeKinds = new Set(["prev", "next", ...variants.flatMap(({ v }) => v.nodes.map(([, kind]) => kind))]);
    const edgeKinds = new Set(variants.flatMap(({ v }) => v.edges.map(([, , kind]) => kind)));
    for (const k of [...nodeKinds, ...edgeKinds]) expect(sheet, k).toContain(`data-legend="${k}"`);
  });

  it("is the committed docs/grammar.svg", () => {
    const committed = readFileSync(join(import.meta.dirname, "..", "docs", "grammar.svg"), "utf8");
    expect(committed === sheet, "docs/grammar.svg is stale: npm run cli -- --grammar docs/grammar.svg").toBe(true);
  });
});

describe("sizeStats", () => {
  it("is deterministic, and grows with the preset", () => {
    expect(sizeStats("S", 40)).toEqual(sizeStats("S", 40));
    const means = PRESETS.map((p) => sizeStats(p, 200).mean);
    for (let i = 1; i < means.length; i++) expect(means[i]).toBeGreaterThan(means[i - 1]!);
    expect(means[0]).toBeGreaterThan(5);
    expect(means[3]).toBeLessThan(45);
    const s = sizeStats("M", 200);
    expect(s.p10 <= s.median && s.median <= s.p90 && s.p90 <= s.max).toBe(true);
    expect(s.rho).toBeGreaterThan(0);
    expect(s.rho).toBeLessThan(1);
  });
});
