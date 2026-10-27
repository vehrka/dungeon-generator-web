import { chains } from "./chains";
import type { LayoutConfig } from "./config";
import { layout, type Layout } from "./layout";
import { normalize } from "./normalize";
import { faces } from "./planar";
import { poolKeys, shapePool } from "./shapes";
import type { DungeonJson, RoomGraph } from "./types";

// JSON → room graph and layout: the whole pipeline (docs/design.md, pipeline).
export function generate(json: DungeonJson, seed: number, config: LayoutConfig): { graph: RoomGraph; layout: Layout } {
  const graph = normalize(json);
  const pool = shapePool(poolKeys(graph, config).values(), seed, config);
  return { graph, layout: layout(graph, chains(graph, faces(graph), config.maxTreeSize), pool, seed, config) };
}
