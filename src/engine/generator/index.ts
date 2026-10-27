import { isSeed } from "../rng";
import { defaultGeneratorConfig, type GeneratorConfig } from "./config";
import { expand } from "./expand";
import type { Preset } from "./grammar";
import { dungeonJson, type GeneratedDungeon } from "./json";
import { reduce } from "./reduce";
import { DEFAULT_THEME, THEMES, type ThemeName } from "./themes";

export type GenerateOptions = { seed: number; size?: Preset; theme?: ThemeName };

// Combined grammar dungeon as schema 2 JSON: expand, reduce, export. Same options give the same
// JSON. Solvable by construction (every lock rule places its key first): asserted.
export function generateDungeon(
  { seed, size = "M", theme = DEFAULT_THEME }: GenerateOptions,
  config: GeneratorConfig = defaultGeneratorConfig,
): GeneratedDungeon {
  if (!isSeed(seed)) throw new Error(`Invalid dungeon seed ${seed}`);
  const t = THEMES[theme];
  if (!t) throw new Error(`Unknown theme ${theme}`);
  const g = expand(seed, size, t, config);
  reduce(g);
  const json = dungeonJson(g, { seed, size, theme }, t);
  if (!json.solvable) throw new Error(`Unsolvable dungeon, seed ${seed} size ${size}: ${json.unsolvable_reasons.join("; ")}`);
  return json;
}
