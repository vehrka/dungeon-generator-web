// ruin.json → ruin-map.svg / .png, or a generated dungeon → m-7-zelda-map.svg
//
//   npm run cli -- ruin.json [-o ruin-map.svg|.png] [--layout-seed N] [--no-corridors] [--style plain|dyson|neon] [--key ruin.md]
//   npm run cli -- --dungeon-seed 7 [--size M] [--theme zelda] [--json m-7-zelda.json] [--key m-7-zelda.md] [...]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defaultConfig } from "../engine/config";
import { generateDungeon, type GenerateOptions } from "../engine/generator/index";
import { PRESETS, type Preset } from "../engine/generator/grammar";
import { DEFAULT_THEME, THEMES, type ThemeName } from "../engine/generator/themes";
import { normalize } from "../engine/normalize";
import { isSeed, maxSeed, seedFromText } from "../engine/rng";
import type { DungeonJson } from "../engine/types";
import { dungeonKey } from "../render/key";
import { draw, mapStyles, type MapStyle } from "../render/svg";

export type CliArgs = {
  source: { input: string } | { generate: Required<GenerateOptions> };
  output: string;
  json?: string;
  key?: string;
  layoutSeed: number | undefined;
  corridors: boolean;
  style?: MapStyle; // the theme's when absent
};

const parseSeed = (flag: string, text: string | undefined): number | undefined => {
  if (text === undefined) return undefined;
  const seed = seedFromText(text);
  if (seed === undefined) throw new Error(`--${flag} must be an integer from 0 to ${maxSeed}: ${text}`);
  return seed;
};

export function parseCli(argv: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      output: { type: "string", short: "o" },
      "layout-seed": { type: "string" },
      "no-corridors": { type: "boolean" },
      "dungeon-seed": { type: "string" },
      size: { type: "string" },
      theme: { type: "string" },
      json: { type: "string" },
      key: { type: "string" },
      style: { type: "string" },
    },
  });
  if (positionals.length > 1) throw new Error(`Expected one input JSON, got ${positionals.length}`);
  const dungeonSeed = parseSeed("dungeon-seed", values["dungeon-seed"]);
  let source: CliArgs["source"];
  let output: string;
  if (dungeonSeed === undefined) {
    for (const flag of ["size", "theme", "json"] as const) if (values[flag] !== undefined) throw new Error(`--${flag} needs --dungeon-seed`);
    if (positionals.length === 0) throw new Error("Missing input JSON, or --dungeon-seed to generate one");
    const input = positionals[0]!;
    source = { input };
    output = values.output ?? input.replace(/(\.json)?$/i, "-map.svg");
  } else {
    if (positionals.length) throw new Error("Pass an input JSON or --dungeon-seed, not both");
    const size = (values.size ?? "M").toUpperCase() as Preset;
    if (!PRESETS.includes(size)) throw new Error(`Unknown size ${values.size}, expected one of ${PRESETS.join(" ")}`);
    const theme = (values.theme ?? DEFAULT_THEME).toLowerCase() as ThemeName;
    if (!Object.hasOwn(THEMES, theme)) throw new Error(`Unknown theme ${theme}, expected one of ${Object.keys(THEMES).join(" ")}`);
    source = { generate: { seed: dungeonSeed, size, theme } };
    output = values.output ?? `${size.toLowerCase()}-${dungeonSeed}-${theme}-map.svg`;
  }
  if (!/\.(svg|png)$/i.test(output)) throw new Error(`Output must end in .svg or .png: ${output}`);
  const layoutSeed = parseSeed("layout-seed", values["layout-seed"]);
  const style = values.style?.toLowerCase() as MapStyle | undefined;
  if (style !== undefined && !mapStyles.includes(style)) throw new Error(`Unknown style ${values.style}, expected one of ${mapStyles.join(" ")}`);
  return { source, output, json: values.json, key: values.key, layoutSeed, corridors: !values["no-corridors"], style };
}

type Out = { log: (m: string) => void; error: (m: string) => void };

// Every failure (arguments, schema, non-planar, no layout) prints its message and returns 1.
export async function main(argv: string[], out: Out = console): Promise<number> {
  try {
    const args = parseCli(argv);
    const { source } = args;
    const json: DungeonJson = "input" in source ? JSON.parse(readFileSync(source.input, "utf8")) : generateDungeon(source.generate);
    normalize(json); // schema check before any file is written; draw normalizes again
    // Written before layout, so a dungeon that fails to lay out can still be inspected.
    if (args.json) writeFileSync(args.json, JSON.stringify(json, null, 2) + "\n");
    if (args.key) writeFileSync(args.key, dungeonKey(json));
    const seed = isSeed(json.seed) ? json.seed : undefined;
    const layoutSeed = args.layoutSeed ?? seed;
    // Only a loaded file can lack one: a generated dungeon carries its dungeon seed.
    if (layoutSeed === undefined) throw new Error(`${(source as { input: string }).input} has no usable seed (${json.seed}); pass --layout-seed`);
    const { svg, rooms } = draw(json, layoutSeed, { ...defaultConfig, corridors: args.corridors }, args.style);
    if (args.output.toLowerCase().endsWith(".png")) {
      const { Resvg } = await import("@resvg/resvg-js"); // native addon, only for PNG
      writeFileSync(args.output, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
    } else {
      writeFileSync(args.output, svg);
    }
    const generated = "generate" in source ? `, dungeon seed ${source.generate.seed}, size ${source.generate.size}, theme ${source.generate.theme}` : "";
    out.log(`${args.output} (${rooms} rooms${generated}, layout seed ${layoutSeed})`);
    return 0;
  } catch (e) {
    out.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
