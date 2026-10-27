import { describe, expect, it } from "vitest";
import { generateDungeon } from "../../src/engine/generator/index";
import { PRESETS } from "../../src/engine/generator/grammar";
import { normalize } from "../../src/engine/normalize";
import { faces } from "../../src/engine/planar";

// Seeds 1–500 per size (~2 s). Room-count percentiles against the Python baseline (generator
// 539c76c, after reduce, ref/generator-port.md): no seed parity, so ±2 on the median, ±4 on p10/p90.
const seeds = Array.from({ length: 500 }, (_, i) => i + 1);
const baseline = { XS: [6, 6, 8], S: [10, 13, 19], M: [12, 18, 29], L: [16, 26, 44] };

describe("generator properties", () => {
  it.each(PRESETS)("%s: solvable, accepted by normalize, planar, rooms near the baseline", (size) => {
    const rooms: number[] = [];
    for (const seed of seeds) {
      const data = generateDungeon({ seed, size }); // throws when unsolvable or on a gate chain
      const graph = normalize(data); // throws on a gate with mixed one-way legs
      faces(graph); // throws NonPlanarError
      expect(graph.doors.some((d) => d.a === d.b), `seed ${seed}: gate inside a room`).toBe(false);
      rooms.push(graph.rooms.size);
    }
    rooms.sort((a, b) => a - b);
    const [p10, median, p90] = [0.1, 0.5, 0.9].map((q) => rooms[Math.floor(q * rooms.length)]!);
    const [b10, bm, b90] = baseline[size];
    expect(Math.abs(median! - bm!), `median ${median} vs ${bm}`).toBeLessThanOrEqual(2);
    expect(Math.abs(p10! - b10!), `p10 ${p10} vs ${b10}`).toBeLessThanOrEqual(4);
    expect(Math.abs(p90! - b90!), `p90 ${p90} vs ${b90}`).toBeLessThanOrEqual(4);
  });
});
