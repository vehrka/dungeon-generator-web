import { defaultConfig, type LayoutConfig } from "../engine/config";
import type { GenerateOptions } from "../engine/generator/index";
import { PRESETS, type Preset } from "../engine/generator/grammar";
import { THEMES, type ThemeName } from "../engine/generator/themes";
import { isSeed, maxSeed, seedFromText } from "../engine/rng";
import type { DungeonJson } from "../engine/types";

// Viewer logic without the DOM (docs/plans/10-viewer.md, 14b); main.ts wires it, worker.ts draws.

export type Loaded = { json: DungeonJson; name: string; seed: number | undefined };

// The first layout seed is the dungeon's, as in the CLI; none usable → the seed field stays empty.
export function load(text: string, file: string): Loaded {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${file} is not JSON`);
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error(`${file} is not a dungeon JSON object`);
  const dungeon = json as DungeonJson; // normalize checks the schema
  return { json: dungeon, name: file.replace(/\.json$/i, ""), seed: isSeed(dungeon.seed) ? dungeon.seed : undefined };
}

// Generate's and reroll's pick: viewer-side only, never the engine's; it goes into the seed field,
// so the map stays reproducible. A Uint32 covers 0..maxSeed.
export const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;

export function parseSeed(s: string, what = "Layout seed"): number {
  const seed = seedFromText(s.trim());
  if (seed === undefined) throw new Error(`${what} must be an integer from 0 to ${maxSeed}: ${s}`);
  return seed;
}

// Select values come from the page, which anyone can edit: checked, not trusted.
export function parseSize(s: string): Preset {
  if (!PRESETS.includes(s as Preset)) throw new Error(`Unknown size ${s}, expected one of ${PRESETS.join(" ")}`);
  return s as Preset;
}

export function parseTheme(s: string): ThemeName {
  if (!Object.hasOwn(THEMES, s)) throw new Error(`Unknown theme ${s}, expected one of ${Object.keys(THEMES).join(" ")}`);
  return s as ThemeName;
}

// As the CLI (14a): m-7-zelda.
export const dungeonName = ({ seed, size, theme }: Required<GenerateOptions>): string => `${size.toLowerCase()}-${seed}-${theme}`;
export const exportName = (name: string, seed: number): string => `${name}-map-${seed}.svg`;
export const jsonName = (name: string): string => `${name}.json`;
export const keyName = (name: string): string => `${name}-key.md`;

export const layoutConfig = (corridors: boolean): LayoutConfig => ({ ...defaultConfig, corridors });
