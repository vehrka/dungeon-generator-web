import { defaultConfig } from "../engine/config";
import type { DungeonJson } from "../engine/types";
import { draw } from "../render/svg";

// Layout off the main thread: a failing layout runs for seconds (docs/plans/10-viewer.md).
export type DrawRequest = { json: DungeonJson; seed: number };
export type DrawResult = { svg: string; rooms: number; ms: number } | { error: string };

self.onmessage = (e: MessageEvent<DrawRequest>) => {
  const t0 = performance.now();
  let result: DrawResult;
  try {
    result = { ...draw(e.data.json, e.data.seed, defaultConfig), ms: Math.round(performance.now() - t0) };
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(result);
};
