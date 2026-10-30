import { generateDungeon, type GenerateOptions } from "../engine/generator/index";
import { LayoutError } from "../engine/layout";
import type { DungeonJson } from "../engine/types";
import { drawGraph } from "../render/graph";
import { draw, type MapStyle } from "../render/svg";
import { layoutConfig } from "./state";

// Generation and layout off the main thread: a failing layout runs for seconds (docs/plans/10-viewer.md).
// A generated dungeon comes back as JSON, also when its layout fails, so it can still be exported
// (as the CLI writes it before layout); a loaded one the main thread already holds. The graph view
// skips layout (docs/plans/24-graph-view.md).
export type View = "map" | "graph";
export type DrawRequest = { source: { json: DungeonJson } | { generate: Required<GenerateOptions> }; seed: number | undefined; corridors: boolean; style: MapStyle; view: View }; // seed: map only
export type DrawResult = { json?: DungeonJson } & ({ svg: string; rooms: number; ms: number } | { error: string; stuck?: number[] });

self.onmessage = (e: MessageEvent<DrawRequest>) => {
  const t0 = performance.now();
  const { source, seed, corridors, style, view } = e.data;
  let generated: DungeonJson | undefined;
  let result: DrawResult;
  try {
    generated = "generate" in source ? generateDungeon(source.generate) : undefined;
    const json = generated ?? (source as { json: DungeonJson }).json;
    if (view === "map" && seed === undefined) throw new Error("No layout seed for the map");
    result = { json: generated, ...(view === "graph" ? drawGraph(json) : draw(json, seed!, layoutConfig(corridors), style)), ms: Math.round(performance.now() - t0) };
  } catch (err) {
    const stuck = err instanceof LayoutError ? { stuck: err.rooms } : {}; // main words it (state.ts layoutFailed)
    result = { json: generated, error: err instanceof Error ? err.message : String(err), ...stuck };
  }
  self.postMessage(result);
};
