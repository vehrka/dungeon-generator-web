// Combined grammar (Python grammar/combined.py, generator 539c76c), canonical here since step 13.
// A rule's variant is picked by one d20 against its range for the size preset; a missing range is
// never chosen. "prev" and "next" are the anchors; item and switch nodes name an object id.

export type Preset = "XS" | "S" | "M" | "L";
export type Span = [number, number];
export type NodeKind = "nt" | "room" | "item" | "switch" | "special";
export type EdgeKind = "both" | "one" | "lock" | "state" | "on" | "off" | "secret";
export type GNode = [id: string, kind: NodeKind, label: string];
export type GEdge = [src: string, dst: string, kind: EdgeKind, ...objects: string[]];
export type Variant = {
  name: string;
  ranges: Partial<Record<Preset, Span>>;
  objects?: Record<string, [type: string, name: string]>;
  nodes: GNode[];
  edges: GEdge[];
};
export type Rule = { desc: string; branch: boolean; variants: Variant[] }; // branch: dead end, no "next"
export type Reward = [label: string, lo: number, hi: number];

export const PRESETS: Preset[] = ["XS", "S", "M", "L"];
export const GATE_KINDS: EdgeKind[] = ["lock", "state", "on", "off", "secret"];

export const REWARDS: Reward[] = [
  ["heart piece", 1, 4],
  ["rupees", 5, 12],
  ["bombs", 13, 16],
  ["arrows", 17, 20],
];

// Non-recursive variant of each recursive rule, taken once the generator limits are hit.
export const FINISH: Record<string, string> = { L: "room", S: "end" };

export const chain = (...ids: string[]): GEdge[] => ids.slice(1).map((b, i) => [ids[i]!, b, "both"]);

const all = (lo: number, hi: number): Partial<Record<Preset, Span>> => ({ XS: [lo, hi], S: [lo, hi], M: [lo, hi], L: [lo, hi] });

// GB variants of a bonus goal table: one dead-end room per reward.
export const rewardVariants = (rewards: Reward[]): Variant[] =>
  rewards.map(([label, lo, hi]) => ({ name: label, ranges: all(lo, hi), nodes: [["gb", "room", `gb: ${label}`]], edges: chain("prev", "gb") }));

export const GRAMMAR: Record<string, Rule> = {
  Start: {
    desc: "Dungeon start (prev = START, next = GOAL)",
    branch: false,
    variants: [
      {
        name: "boss only",
        ranges: { XS: [1, 20] },
        nodes: [["bk", "nt", "BK"]],
        edges: chain("prev", "bk", "next"),
      },
      {
        name: "key wing",
        ranges: { S: [1, 12], M: [1, 4] },
        nodes: [["k", "nt", "K"], ["bk", "nt", "BK"]],
        edges: chain("prev", "k", "bk", "next"),
      },
      {
        name: "item",
        ranges: { S: [13, 20], M: [5, 16], L: [1, 8] },
        nodes: [["e", "nt", "E"], ["ig", "nt", "IG"], ["bk", "nt", "BK"]],
        edges: chain("prev", "e", "ig", "bk", "next"),
      },
      {
        name: "item + wing",
        ranges: { M: [17, 20], L: [9, 20] },
        nodes: [["e", "nt", "E"], ["ig", "nt", "IG"], ["l", "nt", "L"], ["bk", "nt", "BK"]],
        edges: chain("prev", "e", "ig", "l", "bk", "next"),
      },
    ],
  },
  E: {
    desc: "Entrance",
    branch: false,
    variants: [
      {
        name: "single",
        ranges: { XS: [1, 20], S: [1, 18], M: [1, 15], L: [1, 12] },
        nodes: [["l", "nt", "L"]],
        edges: chain("prev", "l", "next"),
      },
      {
        name: "extra entrance",
        ranges: { S: [19, 20], M: [16, 20], L: [13, 20] },
        nodes: [["l", "nt", "L"], ["h", "nt", "R"], ["l2", "nt", "L"], ["x", "special", "EXIT"]],
        edges: [...chain("prev", "l", "h", "next"), ...chain("h", "l2", "x")],
      },
    ],
  },
  L: {
    desc: "Layout chooser (only recursive structure)",
    branch: false,
    variants: [
      {
        name: "room",
        ranges: { XS: [1, 14], S: [1, 12], M: [1, 9], L: [1, 7] },
        nodes: [["r", "nt", "R"]],
        edges: chain("prev", "r", "next"),
      },
      {
        name: "linear",
        ranges: { XS: [15, 17], S: [13, 15], M: [10, 12], L: [8, 10] },
        nodes: [["s", "nt", "S"]],
        edges: chain("prev", "s", "next"),
      },
      {
        name: "small key",
        ranges: { S: [16, 17], M: [13, 14], L: [11, 12] },
        nodes: [["k", "nt", "K"]],
        edges: chain("prev", "k", "next"),
      },
      {
        name: "switch",
        ranges: { XS: [18, 18], S: [18, 18], M: [15, 15], L: [13, 14] },
        nodes: [["w", "nt", "SW"]],
        edges: chain("prev", "w", "next"),
      },
      {
        name: "toggle",
        ranges: { M: [16, 16], L: [15, 15] },
        nodes: [["t", "nt", "TG"]],
        edges: chain("prev", "t", "next"),
      },
      {
        name: "hook",
        ranges: { XS: [19, 20], S: [19, 19], M: [17, 17], L: [16, 16] },
        nodes: [["h", "nt", "H"]],
        edges: chain("prev", "h", "next"),
      },
      {
        name: "loop",
        ranges: { S: [20, 20], M: [18, 19], L: [17, 18] },
        nodes: [["a", "nt", "R"], ["l1", "nt", "L"], ["l2", "nt", "L"], ["b", "nt", "R"]],
        edges: [...chain("prev", "a", "l1", "b", "next"), ...chain("a", "l2", "b")],
      },
      {
        name: "one-way loop",
        ranges: { M: [20, 20], L: [19, 20] },
        nodes: [["a", "nt", "R"], ["l", "nt", "L"], ["b", "nt", "R"]],
        edges: [...chain("prev", "a"), ["a", "l", "one"], ["l", "b", "one"], ["b", "a", "one"], ...chain("b", "next")],
      },
    ],
  },
  R: {
    desc: "Room chooser (terminal content)",
    branch: false,
    variants: [
      {
        name: "nothing",
        ranges: { XS: [1, 3], S: [1, 3], M: [1, 3], L: [1, 3] },
        nodes: [["r", "room", "n"]],
        edges: chain("prev", "r", "next"),
      },
      {
        name: "enemy",
        ranges: { XS: [4, 8], S: [4, 8], M: [4, 8], L: [4, 8] },
        nodes: [["r", "room", "e"]],
        edges: chain("prev", "r", "next"),
      },
      {
        name: "trap",
        ranges: { XS: [9, 11], S: [9, 11], M: [9, 11], L: [9, 11] },
        nodes: [["r", "room", "t"]],
        edges: chain("prev", "r", "next"),
      },
      {
        name: "puzzle",
        ranges: { XS: [12, 16], S: [12, 16], M: [12, 16], L: [12, 16] },
        nodes: [["r", "room", "p"]],
        edges: chain("prev", "r", "next"),
      },
      {
        name: "challenge",
        ranges: { XS: [17, 20], S: [17, 20], M: [17, 20], L: [17, 20] },
        nodes: [["r", "room", "c"]],
        edges: chain("prev", "r", "next"),
      },
    ],
  },
  S: {
    desc: "Linear sequence",
    branch: false,
    variants: [
      {
        name: "end",
        ranges: { XS: [1, 18], S: [1, 17], M: [1, 16], L: [1, 15] },
        nodes: [["r", "nt", "R"]],
        edges: chain("prev", "r", "next"),
      },
      {
        name: "continue",
        ranges: { XS: [19, 20], S: [18, 20], M: [17, 20], L: [16, 20] },
        nodes: [["r", "nt", "R"], ["s", "nt", "S"]],
        edges: chain("prev", "r", "s", "next"),
      },
    ],
  },
  GB: {
    desc: "Bonus goal",
    branch: true,
    variants: rewardVariants(REWARDS),
  },
  H: {
    desc: "Hook: side bonus goal",
    branch: false,
    variants: [
      {
        name: "open",
        ranges: { XS: [1, 12], S: [1, 12], M: [1, 12], L: [1, 12] },
        nodes: [["a", "nt", "R"], ["gb", "nt", "GB"]],
        edges: [...chain("prev", "a", "next"), ...chain("a", "gb")],
      },
      {
        name: "secret",
        ranges: { XS: [13, 20], S: [13, 20], M: [13, 20], L: [13, 20] },
        nodes: [["a", "nt", "R"], ["gb", "nt", "GB"]],
        edges: [...chain("prev", "a", "next"), ["a", "gb", "secret"]],
      },
    ],
  },
  K: {
    desc: "Small key lock",
    branch: false,
    variants: [
      {
        name: "key in wing",
        ranges: { XS: [1, 12], S: [1, 12], M: [1, 12], L: [1, 12] },
        objects: { k: ["key", "small key"] },
        nodes: [["h", "room", "n"], ["l", "nt", "L"], ["key", "item", "k"], ["r", "nt", "R"]],
        edges: [...chain("prev", "h", "l", "key"), ["h", "r", "lock", "k"], ...chain("r", "next")],
      },
      {
        name: "guarded key",
        ranges: { XS: [13, 20], S: [13, 20], M: [13, 20], L: [13, 20] },
        objects: { k: ["key", "small key"] },
        nodes: [["h", "room", "n"], ["r", "nt", "R"], ["key", "item", "k"], ["l", "nt", "L"]],
        edges: [...chain("prev", "h", "r", "key"), ["h", "l", "lock", "k"], ...chain("l", "next")],
      },
    ],
  },
  SW: {
    desc: "Switch lock",
    branch: false,
    variants: [
      {
        name: "one switch",
        ranges: { XS: [1, 20], S: [1, 14], M: [1, 13], L: [1, 12] },
        objects: { s1: ["switch", "switch"] },
        nodes: [["h", "nt", "R"], ["l", "nt", "L"], ["sw", "switch", "s1"]],
        edges: [...chain("prev", "h", "l", "sw"), ["h", "next", "state", "s1"]],
      },
      {
        name: "two switches (and)",
        ranges: { S: [15, 20], M: [14, 20], L: [13, 20] },
        objects: { s1: ["switch", "switch"], s2: ["switch", "switch"] },
        nodes: [["h", "nt", "R"], ["l1", "nt", "L"], ["sw1", "switch", "s1"], ["l2", "nt", "L"], ["sw2", "switch", "s2"]],
        edges: [...chain("prev", "h", "l1", "sw1"), ...chain("h", "l2", "sw2"), ["h", "next", "state", "s1", "s2"]],
      },
    ],
  },
  TG: {
    desc: "Toggle lever: ON opens the way, OFF opens a bonus",
    branch: false,
    variants: [
      {
        name: "toggle",
        ranges: { XS: [1, 20], S: [1, 20], M: [1, 20], L: [1, 20] },
        objects: { t: ["lever", "lever"] },
        nodes: [["h", "room", "n"], ["l", "nt", "L"], ["lv", "switch", "t"], ["m", "nt", "R"], ["gb", "nt", "GB"]],
        edges: [...chain("prev", "h", "l", "lv"), ["h", "m", "on", "t"], ["h", "gb", "off", "t"], ...chain("m", "next")],
      },
    ],
  },
  IG: {
    desc: "Dungeon item gate: mini-boss guards the item that opens the way",
    branch: false,
    variants: [
      {
        name: "item",
        ranges: { XS: [1, 10], S: [1, 10], M: [1, 10], L: [1, 10] },
        objects: { i: ["item", "dungeon item"] },
        nodes: [["h", "room", "n"], ["l", "nt", "L"], ["em", "room", "em"], ["it", "item", "i"], ["m", "nt", "L"]],
        edges: [...chain("prev", "h", "l", "em", "it"), ["h", "m", "lock", "i"], ...chain("m", "next")],
      },
      {
        name: "item + backtrack bonus",
        ranges: { XS: [11, 20], S: [11, 20], M: [11, 20], L: [11, 20] },
        objects: { i: ["item", "dungeon item"] },
        nodes: [["h", "room", "n"], ["l", "nt", "L"], ["em", "room", "em"], ["it", "item", "i"], ["m", "nt", "L"], ["gb", "nt", "GB"]],
        edges: [...chain("prev", "h", "l", "em", "it"), ["h", "m", "lock", "i"], ["h", "gb", "lock", "i"], ...chain("m", "next")],
      },
    ],
  },
  BK: {
    desc: "Boss key: opens the boss room",
    branch: false,
    variants: [
      {
        name: "boss key in wing",
        ranges: { XS: [1, 17], S: [1, 12], M: [1, 12], L: [1, 12] },
        objects: { b: ["bosskey", "boss key"] },
        nodes: [["h", "room", "n"], ["l", "nt", "L"], ["bkey", "item", "b"], ["eb", "room", "eb"]],
        edges: [...chain("prev", "h", "l", "bkey"), ["h", "eb", "lock", "b"], ...chain("eb", "next")],
      },
      {
        name: "boss key behind small key",
        ranges: { XS: [18, 20], S: [13, 20], M: [13, 20], L: [13, 20] },
        objects: { b: ["bosskey", "boss key"] },
        nodes: [["h", "room", "n"], ["k", "nt", "K"], ["bkey", "item", "b"], ["eb", "room", "eb"]],
        edges: [...chain("prev", "h", "k", "bkey"), ["h", "eb", "lock", "b"], ...chain("eb", "next")],
      },
    ],
  },
};

// R content by progress (START 0, boss 1): easy rooms early, traps and challenges late. The middle
// tier is the R ranges of preset M. Rooms near a BOSS_ROOMS room use the last tier.
export const PACING: [top: number, ranges: Record<string, Span>][] = [
  [1 / 3, { nothing: [1, 5], enemy: [6, 11], trap: [12, 12], puzzle: [13, 18], challenge: [19, 20] }],
  [2 / 3, Object.fromEntries(GRAMMAR.R!.variants.map((v) => [v.name, v.ranges.M!]))],
  [1, { nothing: [1, 1], enemy: [2, 6], trap: [7, 11], puzzle: [12, 13], challenge: [14, 20] }],
];
export const BOSS_ROOMS = ["em", "eb"];

const rule = (symbol: string): Rule => {
  const r = GRAMMAR[symbol];
  if (!r) throw new Error(`No grammar rule for ${symbol}`);
  return r;
};

const inSpan = (roll: number, span: Span | undefined): boolean => !!span && span[0] <= roll && roll <= span[1];

export function chooseVariant(symbol: string, preset: Preset, roll: number): Variant {
  const v = rule(symbol).variants.find((v) => inSpan(roll, v.ranges[preset]));
  if (!v) throw new Error(`No variant for ${symbol} preset ${preset} roll ${roll}`);
  return v;
}

// As chooseVariant, but recursive rules take their FINISH variant so the expansion ends.
export function finishVariant(symbol: string, preset: Preset, roll: number): Variant {
  const name = FINISH[symbol];
  return name === undefined ? chooseVariant(symbol, preset, roll) : rule(symbol).variants.find((v) => v.name === name)!;
}

export function pacedRoomVariant(progress: number, roll: number): Variant {
  const [, ranges] = PACING.find(([top]) => progress <= top)!;
  const name = Object.entries(ranges).find(([, span]) => inSpan(roll, span))![0];
  return rule("R").variants.find((v) => v.name === name)!;
}

// Largest eigenvalue of the mean matrix (expected children of each symbol), power iteration. Below
// 1 the recursion is subcritical: dungeons stay small.
export function spectralRadius(preset: Preset, iterations = 500): number {
  const symbols = Object.keys(GRAMMAR);
  const mean = new Map(symbols.map((a) => [a, new Map(symbols.map((b) => [b, 0]))]));
  for (const a of symbols) {
    for (const v of rule(a).variants) {
      const span = v.ranges[preset];
      if (!span) continue;
      for (const [, kind, label] of v.nodes) if (kind === "nt") mean.get(a)!.set(label, mean.get(a)!.get(label)! + (span[1] - span[0] + 1) / 20);
    }
  }
  let vec = new Map(symbols.map((s) => [s, 1]));
  let radius = 0;
  for (let i = 0; i < iterations; i++) {
    const next = new Map(symbols.map((b) => [b, symbols.reduce((sum, a) => sum + vec.get(a)! * mean.get(a)!.get(b)!, 0)]));
    radius = Math.max(...next.values());
    if (radius === 0) return 0;
    vec = new Map([...next].map(([s, x]) => [s, x / radius]));
  }
  return radius;
}
