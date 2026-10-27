import { generateDungeon, type GenerateOptions } from "../engine/generator/index";
import type { DungeonJson } from "../engine/types";
import { draw } from "../render/svg";
import { layoutConfig } from "./state";

// Generation and layout off the main thread: a failing layout runs for seconds (docs/plans/10-viewer.md).
// The reply carries the JSON drawn, so exports match the map shown (docs/plans/14b-generator-viewer.md).
export type DrawRequest = { source: { json: DungeonJson } | { generate: Required<GenerateOptions> }; seed: number; corridors: boolean };
export type DrawResult = { json: DungeonJson; svg: string; rooms: number; ms: number } | { error: string };

self.onmessage = (e: MessageEvent<DrawRequest>) => {
  const t0 = performance.now();
  const { source, seed, corridors } = e.data;
  let result: DrawResult;
  try {
    const json = "json" in source ? source.json : generateDungeon(source.generate);
    result = { json, ...draw(json, seed, layoutConfig(corridors)), ms: Math.round(performance.now() - t0) };
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(result);
};
