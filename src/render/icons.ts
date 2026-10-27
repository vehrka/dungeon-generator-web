// Line glyphs on a 14×14 box, 1 px stroke, no fill (ref/webdesign/design.md, icon glyph).
export const glyphSize = 14;

export const glyphs: Record<string, { name: string; body: string }> = {
  start: { name: "start", body: `<path d="M3 2 L12 7 L3 12 Z"/>` },
  goal: { name: "goal", body: `<path d="M3 13 V1 M3 2 H12 L9 5 L12 8 H3"/>` },
  key: { name: "key", body: `<circle cx="4" cy="7" r="3"/><path d="M7 7 H13 M11 7 V10 M13 7 V10"/>` },
  bosskey: { name: "boss key", body: `<circle cx="4" cy="7" r="3"/><circle cx="4" cy="7" r="1"/><path d="M7 7 H13 M9 7 V10 M11 7 V10 M13 7 V10"/>` },
  item: { name: "item", body: `<path d="M7 1 L13 7 L7 13 L1 7 Z"/>` },
  switch: { name: "switch", body: `<rect x="1" y="4" width="12" height="6"/><circle cx="9.5" cy="7" r="1.5"/>` },
  lever: { name: "lever", body: `<path d="M1 12 H13 M7 12 L11 3"/><circle cx="11" cy="3" r="1.5"/>` },
  treasure: { name: "treasure", body: `<rect x="1" y="5" width="12" height="7"/><path d="M1 8 H13 M6 7 H8 V10 H6 Z"/>` },
};

export const defs = (): string =>
  Object.entries(glyphs)
    .map(([id, g]) => `<symbol id="glyph-${id}" viewBox="0 0 ${glyphSize} ${glyphSize}">${g.body}</symbol>`)
    .join("");
