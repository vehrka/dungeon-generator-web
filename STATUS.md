# Status

**updated:** 2026-10-26

Steps 1–7 (normalize, planarity, chains, geometry, shapes and doors, configuration spaces, energy
and layout) done. Details of each step in [docs/design.md](docs/design.md).

## Done

- [x] Project setup: Vite, TypeScript 7.0.2, vitest, tsx (exact pins, `npm audit` clean), git
  `main` + `dev`.
- [x] Generator JSON schema 2: rooms carry `number` and `label` (done in the generator).
- [x] Design, checked against the thesis and the Edgar-DotNet source (`docs/design.md`).

## Next steps

One feature branch per step, off `dev`, test first.

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
- [ ] 8. **shape sizes from door count**: a room's shapes depend on its door count as well as its
  type, so hubs (up to 7 doors) get walls long enough for all their neighbours. Rerun the
  generator benchmark (M/L, seeds 1–8); target: M-1, M-3 and M-5 lay out.
- [ ] 9. **render and CLI**: SVG (rooms, numbers, labels, doors, locks, one-way, icons), PNG, CLI.
- [ ] 10. **viewer**: load JSON, show map, reroll, export SVG.
- [ ] 11. **corridors**: over-corridor configuration spaces, touching constraint, stage two.
- [ ] 12. **L/T/plus shapes**.
- [ ] 13. **cave shapes**.

## Open points

- Generator gate chains: the exporter walks "through any chain of gates", so gate–gate edges may
  occur; `normalize` rejects them. The fixture has none. Decide: collapse a gate chain into one door
  with all gates, or fix it in the generator.
- Door capacity: `cornerDistance = 0` now default (fixes 3 of the 5 failing benchmark dungeons);
  hub sizing is step 8. Numbers in `docs/design.md`, open points.
- `normalize` rejects a gate with one one-way leg and one two-way leg ("one-way edges that disagree
  on direction"; generator `--size L --seed 5`, gate 22). Should probably be a one-way door.
- PNG library (step 9).
