import { describe, expect, it } from "vitest";
import {
  chooseVariant,
  FINISH,
  finishVariant,
  GRAMMAR,
  PACING,
  pacedRoomVariant,
  PRESETS,
  spectralRadius,
  type Span,
} from "../../src/engine/generator/grammar";

const rolls = (spans: Span[]) => spans.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)).sort((a, b) => a - b);
const d20 = Array.from({ length: 20 }, (_, i) => i + 1);
const label = (symbol: string, preset: (typeof PRESETS)[number], roll: number) => chooseVariant(symbol, preset, roll).nodes[0]![2];

describe("grammar", () => {
  it.each(PRESETS)("ranges cover 1–20 without overlap for %s", (preset) => {
    for (const [symbol, rule] of Object.entries(GRAMMAR)) {
      const spans = rule.variants.flatMap((v) => (v.ranges[preset] ? [v.ranges[preset]] : []));
      expect(rolls(spans), `${symbol} ${preset}`).toEqual(d20);
    }
  });

  it("every nt label is a rule and every object id is declared", () => {
    for (const rule of Object.values(GRAMMAR)) {
      for (const v of rule.variants) {
        const ids = new Set(["prev", "next", ...v.nodes.map(([id]) => id)]);
        for (const [, kind, l] of v.nodes) {
          if (kind === "nt") expect(GRAMMAR, v.name).toHaveProperty([l]);
          if (kind === "item" || kind === "switch") expect(v.objects, v.name).toHaveProperty([l]);
        }
        for (const [src, dst, , ...objects] of v.edges) {
          expect(ids.has(src) && ids.has(dst), `${v.name} ${src} → ${dst}`).toBe(true);
          for (const o of objects) expect(v.objects, v.name).toHaveProperty([o]);
        }
        expect(v.edges.some(([, dst]) => dst === "next"), v.name).toBe(!rule.branch);
      }
    }
  });

  it.each(PRESETS)("is subcritical for %s", (preset) => {
    expect(spectralRadius(preset)).toBeLessThan(1);
  });

  it("pacing tiers cover 1–20 with every R variant", () => {
    const names = GRAMMAR.R!.variants.map((v) => v.name).sort();
    for (const [, ranges] of PACING) {
      expect(rolls(Object.values(ranges))).toEqual(d20);
      expect(Object.keys(ranges).sort()).toEqual(names);
    }
  });

  it("paced rooms get harder", () => {
    const share = (progress: number, labels: string) =>
      d20.filter((roll) => labels.includes(pacedRoomVariant(progress, roll).nodes[0]![2])).length;
    expect(share(0, "tc")).toBeLessThan(share(0.5, "tc"));
    expect(share(0.5, "tc")).toBeLessThan(share(1, "tc"));
    expect(share(0, "n")).toBeGreaterThan(share(1, "n"));
  });

  it("finish variants exist and are not recursive", () => {
    for (const [symbol, name] of Object.entries(FINISH)) {
      for (const preset of PRESETS) {
        const v = finishVariant(symbol, preset, 20);
        expect(v.name).toBe(name);
        expect(v.nodes.some(([, kind, l]) => kind === "nt" && l in FINISH)).toBe(false);
      }
    }
    expect(finishVariant("K", "M", 20)).toBe(chooseVariant("K", "M", 20));
  });

  it("chooses by preset range and rejects missing ones", () => {
    expect(label("Start", "XS", 7)).toBe("BK");
    expect(label("Start", "L", 1)).toBe("E");
    expect(() => chooseVariant("Spam", "M", 1)).toThrow("No grammar rule for Spam");
    expect(() => chooseVariant("L", "M", 21)).toThrow("No variant for L preset M roll 21");
  });
});
