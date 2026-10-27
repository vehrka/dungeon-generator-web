// Layout benchmark over committed generator dungeons (bench/dungeons, sizes M and L, seeds 1–8),
// or with --generated over the same sizes and seeds from generateDungeon (default theme).
// Each dungeon is laid out with layout seeds 1–5; it passes when all five lay out. Exits non-zero
// when any dungeon that normalize and planarity accept fails, unless it is a known failure; a known
// failure that passes also exits non-zero, so the list does not go stale.
//
//   npm run bench [-- m-1 m-3]        only the named dungeons
//   npm run bench -- --no-corridors   rooms touch at every door
//   npm run bench -- --generated      generated dungeons gen-m-1 … gen-l-8, not committed
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { chains } from "../src/engine/chains";
import { defaultConfig } from "../src/engine/config";
import { generateDungeon } from "../src/engine/generator/index";
import { layout, LayoutError } from "../src/engine/layout";
import { normalize } from "../src/engine/normalize";
import { faces, NonPlanarError } from "../src/engine/planar";
import { poolKeys, shapePool } from "../src/engine/shapes";
import type { DungeonJson } from "../src/engine/types";

const dir = join(import.meta.dirname, "dungeons");
const layoutSeeds = [1, 2, 3, 4, 5];
const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const config = { ...defaultConfig, corridors: !args.includes("--no-corridors") };
const generated = args.includes("--generated");
// Dungeon → why it fails and the step that should fix it, per set and corridor mode.
// Generated failures: STATUS open points, to review.
const knownFailures = new Map<string, string>(
  generated
    ? [
        ["gen-l-7", "62 rooms, 10 faces, largest in either set; to review"],
        ["gen-m-3", "tree 17-16-22-18-23 hangs off rooms 11 and 12 of two faces sharing 8-11-15; to review"],
        ...(config.corridors ? [] : [["gen-m-7", "tree 2-5-4-1-7-10 (START) hangs off room 3; to review"] as const]),
      ]
    : config.corridors
      ? []
      : [["m-3", "pendant tree 22-31-34 inside ring 12-7-13-23-29-21, needs corridors"]],
);

const sizes = ["M", "L"] as const;
const dungeonSeeds = [1, 2, 3, 4, 5, 6, 7, 8];
const load: Map<string, () => DungeonJson> = generated
  ? new Map(sizes.flatMap((size) => dungeonSeeds.map((seed) => [`gen-${size.toLowerCase()}-${seed}`, () => generateDungeon({ seed, size })])))
  : new Map(
      readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => [basename(f, ".json"), () => JSON.parse(readFileSync(join(dir, f), "utf8")) as DungeonJson]),
    );
const names = [...load.keys()]
  .filter((n) => only.length === 0 || only.includes(n))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
const width = Math.max(5, ...names.map((n) => n.length));

let failed = 0;
let known = 0;
for (const name of names) {
  let graph, roomFaces;
  try {
    graph = normalize(load.get(name)!());
    roomFaces = faces(graph);
  } catch (e) {
    // Only rejections skip: generator and normalize throw plain Errors, planarity NonPlanarError.
    // Bugs rethrow.
    if (!(e instanceof NonPlanarError) && (e as Error).constructor !== Error) throw e;
    console.log(`${name.padEnd(width)} skipped  ${(e as Error).message}`);
    if (knownFailures.has(name)) failed++; // a skipped known failure loses its acceptance case
    continue;
  }
  const keys = [...poolKeys(graph, config).values()];
  const prepared = { chains: chains(graph, roomFaces, config.maxTreeSize) };

  const results = layoutSeeds.map((seed) => {
    const t0 = performance.now();
    try {
      layout(graph, prepared.chains, shapePool(keys, seed, config), seed, config);
      return { ok: true, ms: performance.now() - t0 };
    } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      return { ok: false, ms: performance.now() - t0, stuck: e.rooms };
    }
  });
  const ok = results.filter((r) => r.ok).length;
  const pass = ok === layoutSeeds.length;
  const reason = knownFailures.get(name);
  if (reason ? pass : !pass) failed++;
  else if (reason) known++;
  const status = reason ? (pass ? "pass (known: remove)" : "known") : pass ? "pass" : "FAIL";
  const ms = Math.round(results.reduce((t, r) => t + r.ms, 0) / results.length);
  const stuck = results.find((r) => !r.ok)?.stuck;
  console.log(
    `${name.padEnd(width)} ${status}  ${ok}/${layoutSeeds.length}` +
      `  ${String(graph.rooms.size).padStart(2)} rooms  ${String(ms).padStart(6)} ms/seed` +
      (stuck ? `  stuck on rooms ${stuck.join(", ")}` : "") +
      (reason && !pass ? `  — ${reason}` : ""),
  );
}
for (const name of knownFailures.keys()) {
  if (only.length > 0 || names.includes(name)) continue;
  console.log(`${name.padEnd(width)} missing  in knownFailures but not in the ${generated ? "generated set" : "bench/dungeons"}`);
  failed++;
}
console.log(`\n${failed} failing, ${known} known`);
process.exitCode = failed > 0 ? 1 : 0;
