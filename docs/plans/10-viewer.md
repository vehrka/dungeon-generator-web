# Step 10: viewer

Branch `feature/viewer` off `dev`. STATUS step 10; design: `docs/design.md` (goals, modules).
Style: `ref/webdesign/design.md` (teenage engineering), tokens from `ref/webdesign/cssvars`.

## Decisions (2026-10-27)

- **Layout in a Web Worker.** A failing layout (M-3) takes ~2.7 s per seed before `LayoutError`, an
  L dungeon ~50 ms; on the main thread the page would freeze. Vite bundles module workers natively,
  no dependency. A new run terminates the running worker, so a reroll cancels a stuck layout.
- **Reroll = layout seed + 1**, wrapping at 2³²−1. Deterministic; any earlier seed can be typed back
  into the seed field.
- **Shared seed rule.** `isSeed` / `maxSeed` move from `cli/main.ts` to `engine/rng.ts`; the first
  layout seed is `json.seed`, as in the CLI.
- **No jsdom.** It would be a new dependency for a thin DOM layer; the logic sits in a pure
  `viewer/state.ts`, the DOM is checked by hand in the browser.

## Change

- `vite.config.ts`: `root: "src/viewer"`, build to `dist/`; `test.root` stays the project root.
- `render/svg.ts` `draw(json, seed, config)`: `generate` + `render` with the title meta, shared by the
  CLI and the worker (moved from `viewer/state.ts` in review: one pipeline, not two). Room numbers and
  gate kinds are escaped too (review: untyped JSON reached `innerHTML`).
- `engine/rng.ts` `seedFromText`: the decimal seed rule, shared by `--layout-seed` and the seed field.
- `viewer/index.html`, `viewer/style.css`: top bar (title weight 300 24 px, hairline rules), control
  row (load JSON, drag and drop on the map, layout seed field, reroll, export svg), the SVG from
  `render()` fit to width, status line (rooms, layout seed, ms, or "laying out…"). Errors in amber,
  message only. 0 radius, no shadow, no web fonts (the SVG's font stack).
- `viewer/worker.ts`: `{ json, seed }` → `generate` + `render` → `{ svg, rooms, ms }` or `{ error }`.
- `viewer/state.ts`: parse the file, initial seed, reroll, seed field parsing, export filename
  `<name>-map-<seed>.svg` (the seed is in the name because rerolls differ).
- `viewer/main.ts`: DOM wiring only.

## Tests first

- `viewer`: initial seed from the JSON; none usable → empty seed field and an amber prompt (changed
  while building: an error would block typing a seed); reroll increments and wraps;
  seed field (empty, negative, non-integer, above the maximum); export filename; invalid JSON gives a
  message, not a stack.
- `rng`: `isSeed` bounds. CLI tests unchanged and green.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean. No engine layout change, so no bench.
- By hand in Chrome (`npm run dev`): load the fixture, reroll, a cancelled M-3 run, export SVG.
- README usage, `docs/design.md` (viewer, modules), `STATUS.md` updated in the same commit.

## Out of scope

- PNG export (resvg is Node-only), zoom and pan, `LayoutConfig` tweaks in the UI, corridors toggle
  (step 11).
