import { defaultConfig, type LayoutConfig } from "../engine/config";
import type { GenerateOptions } from "../engine/generator/index";
import { generate } from "../engine/index";
import { LayoutError } from "../engine/layout";
import { NonPlanarError } from "../engine/planar";
import { PRESETS, type Preset } from "../engine/generator/grammar";
import { THEMES, type ThemeName } from "../engine/generator/themes";
import { isSeed, maxSeed, seedFromText } from "../engine/rng";
import type { DungeonJson } from "../engine/types";
import { mapStyles, type MapStyle } from "../render/svg";

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

const isPreset = (s: unknown): s is Preset => PRESETS.includes(s as Preset);
const isTheme = (s: unknown): s is ThemeName => typeof s === "string" && Object.hasOwn(THEMES, s);

// A loaded file shows its seed, size and theme in the dungeon panel, case as the generator writes
// them. Shown, not promised: Enter rebuilds the file's dungeon only if this generator made it (a
// Python or hand-made file differs). No usable seed → empty field; a size or theme the generator
// does not take leaves its select as it was.
export function panelFor(json: DungeonJson): { seed?: number; size?: Preset; theme?: ThemeName } {
  const size: unknown = typeof json.size === "string" ? json.size.toUpperCase() : undefined;
  const theme: unknown = typeof json.theme === "string" ? json.theme.toLowerCase() : undefined;
  return { ...(isSeed(json.seed) && { seed: json.seed }), ...(isPreset(size) && { size }), ...(isTheme(theme) && { theme }) };
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
  if (!isPreset(s)) throw new Error(`Unknown size ${s}, expected one of ${PRESETS.join(" ")}`);
  return s;
}

export function parseTheme(s: string): ThemeName {
  if (!isTheme(s)) throw new Error(`Unknown theme ${s}, expected one of ${Object.keys(THEMES).join(" ")}`);
  return s;
}

export function parseStyle(s: string): MapStyle {
  if (!mapStyles.includes(s as MapStyle)) throw new Error(`Unknown style ${s}, expected one of ${mapStyles.join(" ")}`);
  return s as MapStyle;
}

// The engine's LayoutError reworded for the panel. A loaded file's dungeon is the file: another
// dungeon seed or size would replace it, so only the layout seed is suggested.
export const layoutFailed = (rooms: number[], generated: boolean): string[] => [
  "No layout could be completed for this dungeon.",
  generated ? "Try another layout seed (reroll), or another dungeon seed or size." : "Try another layout seed (reroll).",
  `Stuck on rooms ${rooms.join(", ")}.`,
];

// As the CLI (14a): m-7-zelda.
export const dungeonName = ({ seed, size, theme }: Required<GenerateOptions>): string => `${size.toLowerCase()}-${seed}-${theme}`;
// Plain keeps the name it had before styles (19).
export const exportName = (name: string, seed: number, style: MapStyle): string => `${name}-map-${seed}${style === "plain" ? "" : `-${style}`}.svg`;
export const jsonName = (name: string): string => `${name}.json`;
export const keyName = (name: string): string => `${name}-key.md`;

export const layoutConfig = (corridors: boolean): LayoutConfig => ({ ...defaultConfig, corridors });


// The worker's last layout: a style change redraws the dungeon shown without laying it out again
// (docs/plans/19-dyson-viewer.md). Keyed on the values, the worker gets a copy. Only the engine's
// deterministic failures are kept; anything else is thrown and tried again next time.
export function layoutCache(): typeof generate {
  let last: { key: string; laid: ReturnType<typeof generate> } | { key: string; error: LayoutError | NonPlanarError } | undefined;
  return (json, seed, config) => {
    const key = JSON.stringify([json, seed, config]);
    if (last?.key !== key) {
      try {
        last = { key, laid: generate(json, seed, config) };
      } catch (error) {
        if (!(error instanceof LayoutError || error instanceof NonPlanarError)) throw error;
        last = { key, error };
      }
    }
    if ("error" in last) throw last.error;
    return last.laid;
  };
}
