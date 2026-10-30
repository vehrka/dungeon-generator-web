# Step 25: grammar sheet

Branch `feature/grammar-sheet` off `dev`. Graph step 2 in `STATUS.md`. The Combined grammar drawn
from `GRAMMAR` as one SVG sheet, after Python's `grammar/render.py` PNG (Graphviz): rule cards,
d20 ranges per size, legend, how to use, expected size. Committed as `docs/grammar.svg`, embedded
in README, reused by the help page (step 3). No engine, layout or schema change, so no bench.

## Decisions

- **Variant diagrams reuse `graphLayout`**, not a second layout. `variantGraph(symbol, variant)`
  builds a `RoomGraph`: `prev` as start (START in `Start`), `next` as goal (GOAL in `Start`; a
  branch rule has none, goal = start, which `graphLayout` already handles), nodes numbered in
  variant order, edges as doors with gates (`lock`, `state`, `on`, `off` from the object ids,
  `secret`, `one`). Labels: `K()` for non-terminals, the room code, the object name for items and
  switches, blank anchors.
- **Left to right, as Python's `rankdir=LR`**: variants are chains of 2–8 nodes; top to bottom
  makes a 5-node row ~450 px tall. `graphLayout(graph, { across: true })`: lay out with each box's
  w and h swapped, then mirror every point across the diagonal (boxes, edge ends, control points,
  bbox). Graph view output byte-identical (default off).
- **Painter split out of `renderGraph`**: `graphBody(layout)` returns the boxes and edges markup
  (refactor commit, graph snapshot unchanged), so the sheet places one diagram per variant row.
- **Look: Python's sheet** (`#eef0f3` canvas, white cards, alternate row tint `#f6f7f9`, grey preset
  headers), node and edge colours from `graph.ts` (already Python's `NODE_STYLE` / `EDGE_STYLE`),
  anchors prev blue and next teal as in Python. Columns as Python's `COLUMNS`: [how to use, legend,
  Start, E, R, S], [L, expected size, GB, H], [K, SW, TG, IG, BK]. Card heights from content, so
  columns lay out in one pass; text widths estimated as in `graph.ts` (`charWidth`).
- **R and GB say what the generator does**, unlike Python's sheet: R rolls by progress (`PACING`
  tiers early / middle / late, not the preset column), GB on the theme's `rewards` (the classic
  default shown). R's card gets the three tier columns; GB's subtitle names the theme table.
- **Expected size from the TS generator**: `generateDungeon` seeds 1–1000 per preset, rooms after
  merge (what the map shows; Python counted before merge), mean, p10, median, p90, max, plus
  `spectralRadius`. 1.7 s for all four presets (measured 2026-10-30): XS 6.5, S 13.7, M 20.2,
  L 28.9 mean (first measured as 7.7, 17.1, 25.0, 35.7: that counted gate nodes too). Python ran 5000; 1000 keeps the staleness test under 2 s.
- **Staleness test**: `tests/grammar.test.ts` renders the sheet and compares it to
  `docs/grammar.svg`; message says `npm run cli -- --grammar docs/grammar.svg`. So a grammar,
  colour or generator change that moves the sheet fails CI until regenerated on purpose.
- **CLI `--grammar <file.svg>`**: writes the sheet and exits; no dungeon options needed. SVG only.

## Change

- Refactor commit: `graphBody` out of `renderGraph`; `across` option in `graphLayout`. Graph SVGs
  of ruin and generated M, L 1–8 byte-identical.
- `render/grammar.ts`: `variantGraph`, `renderGrammar(): string` (cards, columns, title
  "Combined dungeon grammar", subtitle sizes XS / S / M / L), `sizeStats(preset, runs)`.
- CLI `--grammar`. `docs/grammar.svg` generated. README: image under "Generate" and the CLI flag.
- `docs/design.md` § Generator: grammar sheet paragraph; §7 CLI flag.

## Tests first

`tests/grammar.test.ts`:
- `variantGraph`: every variant of every rule builds; anchors as start/goal; a branch rule's goal is
  its start; gate kinds and object names carried.
- `graphLayout(…, { across: true })`: layers left to right (x grows with layer), no edge through a
  box on every variant.
- sheet: one card per rule in `GRAMMAR`, one row per variant, ranges text `a-b`, `a` or `—` per
  preset; R shows the `PACING` tiers; legend lists every node and edge kind used.
- `sizeStats` deterministic, means in the measured ballpark (XS < S < M < L).
- committed `docs/grammar.svg` equals `renderGrammar()`.

`tests/cli.test.ts`: `--grammar` writes the SVG; rejects a non-`.svg` name.

## By hand

Sheet in Chrome and in the README preview (GitHub renders SVG `<img>`; check no external font):
card overflow, long variant names, curve bows in `H` and `TG`, legend swatches. Compare with
Python's `refs/combined.png`.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean; graph dump diff empty.
- `docs/design.md`, README updated; STATUS graph step 2 ticked.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.
