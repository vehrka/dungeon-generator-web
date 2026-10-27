export type Rng = () => number; // uniform in [0, 1)

// rng hashes seeds as 32-bit unsigned; larger ones would wrap and report a seed it did not use.
export const maxSeed = 2 ** 32 - 1;
export const isSeed = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= maxSeed;
// Decimal digits only, so "1e3", "0x10" or "1.0" are not seeds; undefined when out of range.
export const seedFromText = (s: string): number | undefined => (/^\d+$/.test(s) && isSeed(Number(s)) ? Number(s) : undefined);

// mulberry32, seeded from the seed and an optional stream name, so independent stages (e.g. one
// shape family per room type) never shift each other's draws.
export function rng(seed: number, stream = ""): Rng {
  let h = (seed >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < stream.length; i++) h = Math.imul(h ^ stream.charCodeAt(i), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

// Integer in [min, max], both included.
export const randInt = (r: Rng, min: number, max: number): number => min + Math.floor(r() * (max - min + 1));

// Fisher–Yates, in place.
export function shuffle<T>(items: T[], r: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
