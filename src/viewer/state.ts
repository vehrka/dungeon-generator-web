import { isSeed, maxSeed, seedFromText } from "../engine/rng";
import type { DungeonJson } from "../engine/types";

// Viewer logic without the DOM (docs/plans/10-viewer.md); main.ts wires it, worker.ts draws.

export type Loaded = { json: DungeonJson; name: string; seed: number | undefined };

// The first layout seed is the dungeon's, as in the CLI; none usable → the seed field stays empty.
export function load(text: string, name: string): Loaded {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${name} is not JSON`);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error(`${name} is not a dungeon JSON object`);
  const dungeon = json as DungeonJson; // normalize checks the schema
  return { json: dungeon, name, seed: isSeed(dungeon.seed) ? dungeon.seed : undefined };
}

export const reroll = (seed: number): number => (seed === maxSeed ? 0 : seed + 1);

export function parseSeed(s: string): number {
  const seed = seedFromText(s.trim());
  if (seed === undefined) throw new Error(`Layout seed must be an integer from 0 to ${maxSeed}: ${s}`);
  return seed;
}

export const exportName = (name: string, seed: number): string => `${name.replace(/\.json$/i, "")}-map-${seed}.svg`;
