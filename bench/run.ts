// Layout benchmark over committed generator dungeons (bench/dungeons, sizes M and L, seeds 1–8).
// Each dungeon is laid out with layout seeds 1–5; it passes when all five lay out. Exits non-zero
// when any dungeon that normalize and planarity accept fails.
//
//   npm run bench [-- m-1 m-3]   only the named dungeons
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { chains } from "../src/engine/chains";
import { defaultConfig } from "../src/engine/config";
import { layout, LayoutError } from "../src/engine/layout";
import { normalize } from "../src/engine/normalize";
import { faces, NonPlanarError } from "../src/engine/planar";
import { poolKeys, shapePool } from "../src/engine/shapes";
import type { DungeonJson } from "../src/engine/types";

const dir = join(import.meta.dirname, "dungeons");
const layoutSeeds = [1, 2, 3, 4, 5];
const only = process.argv.slice(2);

const names = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => basename(f, ".json"))
  .filter((n) => only.length === 0 || only.includes(n))
  .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

let failed = 0;
for (const name of names) {
  const json = JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as DungeonJson;
  let graph, roomFaces;
  try {
    graph = normalize(json);
    roomFaces = faces(graph);
  } catch (e) {
    // Only rejections skip: normalize throws plain Errors, planarity NonPlanarError. Bugs rethrow.
    if (!(e instanceof NonPlanarError) && (e as Error).constructor !== Error) throw e;
    console.log(`${name.padEnd(5)} skipped  ${(e as Error).message}`);
    continue;
  }
  const keys = [...new Set(poolKeys(graph, defaultConfig).values())];
  const prepared = { chains: chains(graph, roomFaces, defaultConfig.maxTreeSize) };

  const results = layoutSeeds.map((seed) => {
    const t0 = performance.now();
    try {
      layout(graph, prepared.chains, shapePool(keys, seed, defaultConfig), seed, defaultConfig);
      return { ok: true, ms: performance.now() - t0 };
    } catch (e) {
      if (!(e instanceof LayoutError)) throw e;
      return { ok: false, ms: performance.now() - t0, stuck: e.rooms };
    }
  });
  const ok = results.filter((r) => r.ok).length;
  if (ok < layoutSeeds.length) failed++;
  const ms = Math.round(results.reduce((t, r) => t + r.ms, 0) / results.length);
  const stuck = results.find((r) => !r.ok)?.stuck;
  console.log(
    `${name.padEnd(5)} ${ok === layoutSeeds.length ? "pass" : "FAIL"}  ${ok}/${layoutSeeds.length}` +
      `  ${String(graph.rooms.size).padStart(2)} rooms  ${String(ms).padStart(6)} ms/seed` +
      (stuck ? `  stuck on rooms ${stuck.join(", ")}` : ""),
  );
}
console.log(`\n${failed} failing`);
process.exitCode = failed > 0 ? 1 : 0;
