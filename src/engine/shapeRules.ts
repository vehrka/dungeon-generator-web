// Side length range (grid units) of the rooms of each generator room type.
export type SizeRule = { min: number; max: number };

const small: SizeRule = { min: 3, max: 5 };
const normal: SizeRule = { min: 4, max: 7 };
const entrance: SizeRule = { min: 4, max: 6 };
const large: SizeRule = { min: 6, max: 9 };
const huge: SizeRule = { min: 7, max: 10 };

const rules: Record<string, SizeRule> = {
  st: entrance,
  exit: entrance,
  gl: huge,
  eb: huge,
  em: large,
  gb: large,
  n: normal,
  e: normal,
  m: normal,
  t: normal,
  p: normal,
  c: normal,
  item: small,
  key: small,
  bosskey: small,
  switch: small,
  lever: small,
};

// Bonus goals come as "gb: <reward>"; unknown types get the normal range.
export const sizeRule = (type: string): SizeRule => rules[type.split(":")[0]!] ?? normal;
