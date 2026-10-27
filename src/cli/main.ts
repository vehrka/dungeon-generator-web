// ruin.json → ruin-map.svg / .png
//
//   npm run cli -- ruin.json [-o ruin-map.svg|.png] [--layout-seed N]
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Resvg } from "@resvg/resvg-js";
import { defaultConfig } from "../engine/config";
import { generate } from "../engine/index";
import type { DungeonJson } from "../engine/types";
import { render } from "../render/svg";

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
  if (seed !== undefined && !/^\d+$/.test(seed)) throw new Error(`--layout-seed must be a non-negative integer: ${seed}`);
  return { input, output, layoutSeed: seed === undefined ? undefined : Number(seed) };
}

type Out = { log: (m: string) => void; error: (m: string) => void };

// Every failure (arguments, schema, non-planar, no layout) prints its message and returns 1.
export async function main(argv: string[], out: Out = console): Promise<number> {
  try {
    const args = parseCli(argv);
    const json = JSON.parse(readFileSync(args.input, "utf8")) as DungeonJson;
    const layoutSeed = args.layoutSeed ?? json.seed;
    const { graph, layout } = generate(json, layoutSeed, defaultConfig);
    const svg = render(graph, layout, { seed: json.seed, layoutSeed, theme: json.theme, size: json.size, grammar: json.grammar });
    if (args.output.toLowerCase().endsWith(".png")) {
      writeFileSync(args.output, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
    } else {
      writeFileSync(args.output, svg);
    }
    out.log(`${args.output} (${graph.rooms.size} rooms, layout seed ${layoutSeed})`);
    return 0;
  } catch (e) {
    out.error((e as Error).message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
