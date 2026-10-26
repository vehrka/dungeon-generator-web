export type Rng = () => number; // uniform in [0, 1)

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
