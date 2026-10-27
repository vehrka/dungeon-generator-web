// ruin.json → ruin-map.svg / .png
//
//   npm run cli -- ruin.json [-o ruin-map.svg|.png] [--layout-seed N]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defaultConfig } from "../engine/config";
import { isSeed, maxSeed, seedFromText } from "../engine/rng";
import type { DungeonJson } from "../engine/types";
import { draw } from "../render/svg";

export type CliArgs = { input: string; output: string; layoutSeed: number | undefined };

export function parseCli(argv: string[]): CliArgs {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { output: { type: "string", short: "o" }, "layout-seed": { type: "string" } },
  });
  if (positionals.length === 0) throw new Error("Missing input JSON");
  if (positionals.length > 1) throw new Error(`Expected one input JSON, got ${positionals.length}`);
  const input = positionals[0]!;
  const output = values.output ?? input.replace(/(\.json)?$/i, "-map.svg");
  if (!/\.(svg|png)$/i.test(output)) throw new Error(`Output must end in .svg or .png: ${output}`);
  const seed = values["layout-seed"];
  const layoutSeed = seed === undefined ? undefined : seedFromText(seed);
  if (seed !== undefined && layoutSeed === undefined) throw new Error(`--layout-seed must be an integer from 0 to ${maxSeed}: ${seed}`);
  return { input, output, layoutSeed };
}

type Out = { log: (m: string) => void; error: (m: string) => void };

// Every failure (arguments, schema, non-planar, no layout) prints its message and returns 1.
export async function main(argv: string[], out: Out = console): Promise<number> {
  try {
    const args = parseCli(argv);
    const json = JSON.parse(readFileSync(args.input, "utf8")) as DungeonJson;
    const seed = isSeed(json.seed) ? json.seed : undefined;
    const layoutSeed = args.layoutSeed ?? seed;
    if (layoutSeed === undefined) throw new Error(`${args.input} has no usable seed (${json.seed}); pass --layout-seed`);
    const { svg, rooms } = draw(json, layoutSeed, defaultConfig);
    if (args.output.toLowerCase().endsWith(".png")) {
      const { Resvg } = await import("@resvg/resvg-js"); // native addon, only for PNG
      writeFileSync(args.output, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
    } else {
      writeFileSync(args.output, svg);
    }
    out.log(`${args.output} (${rooms} rooms, layout seed ${layoutSeed})`);
    return 0;
  } catch (e) {
    out.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
