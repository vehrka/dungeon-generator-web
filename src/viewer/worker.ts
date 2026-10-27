import { generateDungeon, type GenerateOptions } from "../engine/generator/index";
import type { DungeonJson } from "../engine/types";
import { draw } from "../render/svg";
import { layoutConfig } from "./state";

// Generation and layout off the main thread: a failing layout runs for seconds (docs/plans/10-viewer.md).
// A generated dungeon comes back as JSON, also when its layout fails, so it can still be exported
// (as the CLI writes it before layout); a loaded one the main thread already holds.
export type DrawRequest = { source: { json: DungeonJson } | { generate: Required<GenerateOptions> }; seed: number; corridors: boolean };
export type DrawResult = { json?: DungeonJson } & ({ svg: string; rooms: number; ms: number } | { error: string });

self.onmessage = (e: MessageEvent<DrawRequest>) => {
  const t0 = performance.now();
  const { source, seed, corridors } = e.data;
  let generated: DungeonJson | undefined;
  let result: DrawResult;
  try {
    generated = "generate" in source ? generateDungeon(source.generate) : undefined;
    result = { json: generated, ...draw(generated ?? (source as { json: DungeonJson }).json, seed, layoutConfig(corridors)), ms: Math.round(performance.now() - t0) };
  } catch (err) {
    result = { json: generated, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(result);
};
