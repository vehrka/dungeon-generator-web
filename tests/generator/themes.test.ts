import { describe, expect, it } from "vitest";
import { generateDungeon } from "../../src/engine/generator/index";
import { rewardVariant, THEMES } from "../../src/engine/generator/themes";

describe("themes", () => {
  it.each(Object.keys(THEMES))("%s rewards cover 1–20", (name) => {
    const theme = THEMES[name as keyof typeof THEMES];
    const rolls = theme.rewards.flatMap(([, lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)).sort((a, b) => a - b);
    expect(rolls).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("plain has zelda's text, only the theme field differs", () => {
    expect(THEMES.plain).toEqual(THEMES.zelda);
    for (const seed of [1, 7]) expect(generateDungeon({ seed, theme: "plain" })).toEqual({ ...generateDungeon({ seed, theme: "zelda" }), theme: "plain" });
  });

  it("reward variants are dead-end gb rooms", () => {
    const v = rewardVariant(THEMES.cyber, 6);
    expect(v.nodes).toEqual([["gb", "room", "gb: paydata"]]);
    expect(v.edges).toEqual([["prev", "gb", "both"]]);
  });
});
