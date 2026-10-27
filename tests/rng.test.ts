import { describe, expect, it } from "vitest";
import { isSeed, maxSeed, seedFromText } from "../src/engine/rng";

describe("isSeed", () => {
  it("accepts 32-bit unsigned integers only", () => {
    expect(maxSeed).toBe(4294967295);
    for (const n of [0, 1, maxSeed]) expect(isSeed(n)).toBe(true);
    for (const n of [-1, 1.5, maxSeed + 1, NaN, "3", undefined]) expect(isSeed(n)).toBe(false);
  });
});

describe("seedFromText", () => {
  it("reads decimal digits in range only", () => {
    expect(seedFromText("0")).toBe(0);
    expect(seedFromText("4294967295")).toBe(maxSeed);
    for (const s of ["", "-1", "1.0", "1e3", "0x10", " 1", "4294967296"]) expect(seedFromText(s)).toBeUndefined();
  });
});
