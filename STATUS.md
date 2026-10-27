# Status

**updated:** 2026-10-27

Steps 1–12 (normalize, planarity, chains, geometry, shapes and doors, configuration spaces, energy
and layout, hub shape sizes, render and CLI, viewer, corridors, L/T shapes) done. Details of each step in [docs/design.md](docs/design.md).
Next: port the generator (steps 13–14). Cave shapes dropped.

## Done

- [x] Project setup: Vite, TypeScript 7.0.2, vitest, tsx (exact pins, `npm audit` clean), git
  `main` + `dev`.
- [x] Generator JSON schema 2: rooms carry `number` and `label` (done in the generator).
- [x] Design, checked against the thesis and the Edgar-DotNet source (`docs/design.md`).
- [x] Project `CLAUDE.md` and layout benchmark (`npm run bench`, 16 committed generator dungeons).

## Next steps

One feature branch per step, off `dev`, test first, `/code-review` before merging into `dev`.

- [x] 1. **normalize**: JSON → room graph, gates collapsed into door edges. Fixture: 26 rooms,
  27 doors (3 lock, 1 state), one 3-room one-way loop.
- [x] 2. **planarity**: planarity test, faces, outer (largest) face dropped. Error on non-planar.
- [x] 3. **chains**: smallest face first, cycles before trees, BFS trees ≤ 8, merge small trees.
- [x] 4. **geometry**: orthogonal polygons and segments, intersection, overlap area.
- [x] 5. **shapes and doors**: seeded rectangle pool per room type, door lines (`doorLength`,
  `cornerDistance`).
- [x] 6. **configuration spaces**: per shape pair, cached; door at an offset; maximum intersection.
- [x] 7. **energy and layout**: greedy placement, simulated annealing for cycles, planner with
  backtracking, iteration cap (100k, retry 4×), `LayoutError` naming the stuck chain. No corridors.
- [x] 8. **shape sizes from door count**: a room's shapes depend on its door count as well as its
  type: above `hubDegree` (4) neighbours both size bounds grow by `hubGrowth` (1) each. M-1 3/5 →
  5/5, no regressions. Plan: `docs/plans/08-hub-shapes.md`.
- [x] 8b. **M-3**: deferred to step 11. Room 22 and its pendant tree `31-34` must sit inside ring
  12-7-13-23-29-21, closed tight by cycle chains 3 and 4; touching rooms leave no cavity. No engine change:
  M-3 is a bench known failure (`knownFailures` in `bench/run.ts`). Plan: `docs/plans/08b-m3.md`.
- [x] 9. **render and CLI**: SVG (rooms, numbers, doors, gate tags, one-way, glyphs, key column with
  labels and gates, legend), PNG via `@resvg/resvg-js` 2.6.2, CLI (`-o`, `--layout-seed`), pipeline
  in `engine/index.ts` (`generate`). Neutral rooms, amber gates, labels in the key column.
  Plan: `docs/plans/09-render-cli.md`.
- [x] 10. **viewer**: load JSON (file or drop), seed field, reroll (seed + 1), export SVG; layout in
  a Web Worker so a failing layout (~2.7 s/seed) neither freezes the page nor blocks a reroll.
  `isSeed` shared in `engine/rng.ts`. Plan: `docs/plans/10-viewer.md`.
- [x] 11. **corridors**: over-corridor configuration spaces, touching constraint (`roomsCanTouch`,
  off by default as in Edgar), stage two. On by default, `corridorRate` 0.95 per room pair,
  lengths `[1, 3, 5]` (measured on M-3); CLI `--no-corridors`, viewer checkbox, bench
  `--no-corridors`. M-3 5/5 with corridors, known failure only without. Plan:
  `docs/plans/11-corridors.md`.
- [x] 12. **L/T/plus shapes**: L, T and plus families per pool key, own streams (rectangles of a
  seed unchanged), all distinct rotations as Edgar, `geometry.rotate`. Arms ≥ `minArm` (2),
  cut-outs ≥ `minNotch` (2). Defaults one L and one T base per key, plus off (fails M-3 with
  corridors, 2× time). Render: number in the largest rectangle of column or row slabs. Bench both
  modes healthy. Plan: `docs/plans/12-lt-shapes.md`.
- ~~**cave shapes**~~: dropped 2026-10-27.
- [ ] 13. **generator core**: port the Combined grammar of `../101.02_dungeon_generator` (commit
  `539c76c`) to `src/engine/generator/`, pure TS: graph module, grammar and theme data, expansion
  with limits and finish mode, pacing, reduce, solvability, schema 2 JSON (numbers, labels).
  Randomness through `rng(seed, stream)`, object ids from the dungeon. Fixes: both legs of a
  one-way gate one-way; gate chains asserted impossible. Tests are properties and statistics
  against the Python baseline, no seed parity. Context: `ref/generator-port.md`.
- [ ] 14. **generator integration**: CLI and viewer generate a dungeon (size, theme, dungeon seed)
  then lay it out (layout seed); JSON and GM key (Markdown) export; loading a JSON file keeps
  working; bench on generated dungeons; rewrite the generator rules in project `CLAUDE.md` and
  close the gate-chain and mixed one-way open points. Open questions in `ref/generator-port.md`.

## Open points

- Step 12 costs time and some M-3 margin: with corridors ms/seed grows 2–4× (l-1 46 → 153, m-1
  53 → 294, m-3 1201 → 2462), without about 1.5–2×; M-3 over layout seeds 1–20 drops from 19/20
  to 15/20 (bench seeds 1–5 still 5/5). Bigger pools: more configuration spaces, more perturb
  choices. `lShapes`/`tShapes` 0 restores the step-11 pools.
- Plus (off by default): one outline can get different ids in two pools (`0/n` draws
  `plus-7x6-…-r1`, the hub pool `plus-6x7-…-r0`), so its configuration spaces are cached twice and
  a switch between them counts as a shape change. Ids from a canonical outline would fix it; not
  done while plus is off.
- About ⅔ of placed rooms are L or T: a base brings 4 rotations against 4 rectangles and perturb
  picks uniformly. A weight per family would need its own step.
- Bench without corridors is ~10–25% slower than before step 11 (same layouts; the touching and
  link terms in the energy hot path). Machine noise is ~20%, so not chased.
- Viewer export name `<name>-map-<seed>.svg` does not say whether corridors were on; two maps of
  one seed can share a name.
- Rooms without a direct door may still touch (`roomsCanTouch` true, Edgar's default). Try false
  for cleaner maps if the bench allows it.

- Generator port, decided 2026-10-27: the TS generator becomes canonical (Python frozen), no seed,
  uid or index parity with Python, the two generator issues below are fixed in the port (steps
  13–14, `ref/generator-port.md`).
- Generator gate chains: the exporter walks "through any chain of gates", so gate–gate edges may
  occur; `normalize` rejects them. The fixture has none. 0 of 2000 Python dungeons have one and
  the grammar cannot make one: step 13 asserts it.
- Door capacity: `cornerDistance = 0` now default (fixes 3 of the 5 failing benchmark dungeons);
  hub sizing done in step 8 (M-1 fixed); M-3 known failure until corridors (step 8b). Numbers in
  `docs/design.md`, open points.
- `normalize` rejects a gate with one one-way leg and one two-way leg ("one-way edges that disagree
  on direction"; generator `--size L --seed 5`, gate 22). Should probably be a one-way door.
  Cause: `_add_link` makes only the leg into the gate one-way; M 8/500, L 52/500 dungeons. Step 13
  makes both legs one-way.
- Render: the key column width is estimated from character counts (no font metrics); a wide
  fallback font can overflow it. Gate tags and one-way chevrons can touch on short walls with
  several doors; not seen on the fixture or M-1. The glyph row of a room is not clipped to it: 4+
  glyphs (start/goal, objects, treasure) on a 3-unit room spill over the wall. No generator room
  holds more than one object today; revisit with L/T shapes (step 12), whose arms are narrower.
