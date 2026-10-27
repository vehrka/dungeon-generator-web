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

// Pool key "<type>" or "<type>+<extra>" (shapes.ts poolKey). Bonus goals come as "gb: <reward>";
// unknown types get the normal range. Hubs grow both bounds by growth per extra neighbour.
export function sizeRule(key: string, growth = 0): SizeRule {
  const [, type, extra] = key.match(/^(.*?)(?:\+(\d+))?$/)!;
  const { min, max } = rules[type!.split(":")[0]!] ?? normal;
  const grow = Number(extra ?? 0) * growth;
  return { min: min + grow, max: max + grow };
}
