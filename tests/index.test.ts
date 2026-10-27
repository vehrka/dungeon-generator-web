import { describe, expect, it } from "vitest";
import ruin from "./fixtures/ruin.json";
import { chains } from "../src/engine/chains";
import { defaultConfig } from "../src/engine/config";
import { generate } from "../src/engine/index";
import { layout } from "../src/engine/layout";
import { normalize } from "../src/engine/normalize";
import { faces } from "../src/engine/planar";
import { poolKeys, shapePool } from "../src/engine/shapes";
import type { DungeonJson } from "../src/engine/types";

describe("generate", () => {
  it("equals the hand-chained pipeline", () => {
    const g = normalize(ruin as DungeonJson);
    const pool = shapePool(poolKeys(g, defaultConfig).values(), 7, defaultConfig);
    const expected = layout(g, chains(g, faces(g), defaultConfig.maxTreeSize), pool, 7, defaultConfig);
    expect(generate(ruin as DungeonJson, 7, defaultConfig)).toEqual({ graph: g, layout: expected });
  });
});
