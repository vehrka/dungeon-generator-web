import { REWARDS, rewardVariants, type Reward, type Variant } from "./grammar";

// Themes (Python grammar/themes.py): text only. Room types and object types stay the same, so a
// seed gives the same graph with any theme. rooms: description per room type (st, gl, exit for
// START, GOAL, EXIT), missing types use ROOM_STYLE and SPECIAL_ROOMS. objects: name per object type,
// missing types keep the grammar name. rewards: bonus goal d20 table, covers 1–20.
export type Theme = { rooms: Record<string, string>; objects: Record<string, string>; rewards: Reward[] };
export type ThemeName = "zelda" | "cyber" | "tor-barrow" | "tor-dwarf";

export const DEFAULT_THEME: ThemeName = "zelda";

export const THEMES: Record<ThemeName, Theme> = {
  zelda: { rooms: {}, objects: {}, rewards: REWARDS },
  cyber: {
    rooms: {
      st: "jack-in point (START)",
      gl: "data core (GOAL)",
      exit: "backdoor (EXIT)",
      n: "empty node / scan",
      e: "ICE",
      t: "trace trap",
      p: "encrypted lock (puzzle)",
      c: "firewall (hacking check)",
      em: "black ICE sentinel",
      eb: "core AI",
      gb: "data cache",
    },
    objects: { key: "access code", bosskey: "root key", item: "icebreaker", switch: "relay", lever: "breaker" },
    rewards: [
      ["black-market program", 1, 4],
      ["paydata", 5, 12],
      ["credentials", 13, 16],
      ["crypto wallet", 17, 20],
    ],
  },
  "tor-barrow": {
    rooms: {
      st: "grass-grown portal (START)",
      gl: "burial vault of the prince (GOAL)",
      exit: "hidden cleft (EXIT)",
      n: "silent crypt (Explore, Scan)",
      e: "restless dead",
      t: "sorcerous mist (Endurance loss)",
      p: "rhyming portal (Riddle, Lore)",
      c: "oath-rune seal (Lore, Song)",
      em: "tomb sentinel",
      eb: "barrow-wight lord",
      gb: "royal grave-goods (Shadow: Greed)",
    },
    objects: {
      key: "bronze key",
      bosskey: "rune-inscribed sigil",
      item: "blessed censer",
      switch: "gravestone catch",
      lever: "counterweight stone",
    },
    rewards: [
      ["treasure points", 1, 8],
      ["precious object", 9, 14],
      ["marvellous artefact", 15, 18],
      ["barrow-blade (famous weapon)", 19, 20],
    ],
  },
  "tor-dwarf": {
    rooms: {
      st: "silent threshold (START)",
      gl: "despoiled throne hall (GOAL)",
      exit: "choked flue (EXIT)",
      n: "echoing hall (Explore, Scan)",
      e: "orcs and goblins",
      t: "fumes or shaft fall (Endurance loss)",
      p: "ithildin seal (Riddle, Lore)",
      c: "collapsed passage (Athletics, Explore)",
      em: "orc-captain",
      eb: "cave-troll or great orc",
      gb: "sealed dwarf vault (Shadow: Greed)",
    },
    objects: {
      key: "iron key",
      bosskey: "ring of the vault-keeper",
      item: "dwarf mattock",
      switch: "rune-tile",
      lever: "sluice wheel",
    },
    rewards: [
      ["treasure points", 1, 8],
      ["precious object", 9, 14],
      ["marvellous artefact", 15, 18],
      ["famous weapon or armour", 19, 20],
    ],
  },
};

// Default room descriptions (Python utils/dungeon_render.py ROOM_STYLE, utils/dungeon_json.py).
export const ROOM_STYLE: Record<string, string> = {
  n: "nothing / explore",
  e: "enemy",
  m: "monster",
  em: "mini-boss",
  eb: "boss",
  t: "trap",
  p: "puzzle",
  c: "challenge (skill check)",
  gb: "bonus goal",
};
export const SPECIAL_ROOMS: Record<string, string> = {
  st: "Entrance (START)",
  gl: "Dungeon goal (GOAL)",
  exit: "Extra entrance (EXIT)",
};

export function rewardVariant(theme: Theme, roll: number): Variant {
  const i = theme.rewards.findIndex(([, lo, hi]) => lo <= roll && roll <= hi);
  if (i < 0) throw new Error(`No reward for roll ${roll}`);
  return rewardVariants(theme.rewards)[i]!;
}
