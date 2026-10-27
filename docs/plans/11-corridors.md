# Step 11: corridors

Branch `feature/corridors` off `dev`. STATUS step 11; design: `docs/design.md` §4–6 (corridors,
over-corridor configuration spaces, energy, stage two). Edgar: `Constraints/CorridorConstraints.cs`,
`Constraints/TouchingConstraints.cs`, `ConfigurationSpaces/ConfigurationSpacesGenerator.cs`
(`GetConfigurationSpaceOverCorridor`), `LayoutOperations/LayoutOperations.cs` (`AddCorridors`,
`AddCorridorGreedily`), `ChainDecompositions/TwoStageChainDecomposition.cs`.

## Decisions (2026-10-27)

- **Corridors on by default**, `corridors: false` (CLI `--no-corridors`, viewer checkbox) gives
  today's touching layout.
- **`corridorRate = 0.95`**, a seeded choice per room pair (`rng(seed, "corridors")`, layout seed),
  not per door: parallel doors already share one door segment. Edgar puts a corridor on every
  connection; a few direct doors keep some rooms touching on purpose.
- **Corridor shapes**: straight, 1 wide, both orientations, doors only on the two short ends.
  `corridorLengths = [1, 3, 5]`. Started at Edgar's `[1, 2]` (`Resources/Rooms/corridors.yml`);
  M-3 needed the slack. M-3 over layout seeds 1–20: `[1, 2]` 5/20, `[1, 3]` 13/20, `[1, 2, 3]`
  14/20, `[2, 4]` 17/20, `[1, 4]` 18/20, `[1, 2, 3, 4, 5, 6]` 18/20 (rate 1 too), `[1, 2, 4, 6]`
  19/20, `[1, 3, 5]` 19/20 and the fastest. Rate 1 with `[1, 2]`: 0/5, so more corridors alone do
  not help; their length does.
- **Touching**: `roomsCanTouch = true`, Edgar's default; false adds +1 energy per non-neighbour
  room pair that touches (corridors excluded).
- **Chains unchanged**: the stage-one graph is the room graph. A corridor joins the first chain
  that has placed both its rooms (TwoStage decomposition), computed in `layout.ts`.

## Change

- `config.ts`: `corridors`, `corridorRate`, `corridorLengths`, `roomsCanTouch`,
  `maxStageTwoFailures` (10 000, Edgar).
- `shapes.ts`: `Shape` gets optional `doorLines`; `corridorShapes(config)`. `doors.ts`: corridor
  end lines.
- `configSpace.ts`: spaces from a shape's own door lines when it has them; `overCorridor(moving,
  fixed, corridors)` (thesis Algorithm 1): per offset of a corridor against the fixed room, the
  moving room's space against the moved corridor, minus offsets where moving overlaps fixed;
  merged over corridor shapes, cached per shape pair.
- `energy.ts`: `adjacent` → `link(i, j): "door" | "corridor" | null`; a corridor pair's distance
  is measured against the over-corridor space. Corridors sit in `LayoutState` under synthetic ids:
  later rooms count overlap with them, no distance, no touching. `Terms` gets `touching`;
  `isValid` checks it.
- `layout.ts`: greedy and perturb use each neighbour's space; stage two after every valid chain
  layout, trees included: corridors of the chain greedily (shapes shuffled, maximum intersection
  with both rooms must satisfy 2, first point without overlap). A failure yields nothing and counts
  toward `maxStageTwoFailures`. Stage two counts toward the iteration budget.
- `Layout`: `PlacedDoor` gets `corridor?: { shape, at, segment }`. `segment` stays the door on
  room `a` (gate tag, one-way); `corridor.segment` is the door on room `b`.
- `render/svg.ts`: corridor polygons (neutral, `ref/webdesign`), doors at both ends.
- CLI `--no-corridors`; viewer checkbox (`state.ts` tested).
- `bench/run.ts`: `--no-corridors`; `knownFailures` per mode (M-3 known only without corridors).

## Tests first

- `doors`: corridor lines only on the short ends.
- `configSpace`: over-corridor space on a hand-computed small case; no offset overlaps the fixed
  room; door at an offset through a corridor.
- `energy`: corridor pair distance, overlap with a placed corridor, touching count.
- `layout`: stage two places every corridor of a chain; blocked corridor → no layout from that
  state; same JSON + seed → same corridors; `corridors: false` → no corridors, old layout.
- `render`: snapshot with a corridor; CLI `--no-corridors`; viewer toggle state.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean.
- `npm run bench -- --no-corridors`: same table as before (M-3 known).
- `npm run bench`: every dungeon 5/5 including M-3; M-3 out of the corridor-mode `knownFailures`.
  Before/after table in the commit body.
- `docs/design.md`, `STATUS.md`, `CLAUDE.md` (bench commands, healthy run) updated in the same
  commit; `/code-review` before the merge into `dev`.

## Risks

- Edgar marks its over-corridor spaces as possibly overlapping the corridor ("TODO: problem with
  corridors overlapping"); stage two catches it, at a cost in ms/seed. Measure.
- Over-corridor spaces are larger to build than direct ones (corridor offsets × shape pairs);
  lazy cache, measure on L dungeons.
- If M-3 still fails: longer corridors first, then the 08b candidates ("early" trees, enclosed
  pendant tree before its ring).

## Result (2026-10-27)

`npm run bench` (corridors) vs `--no-corridors` vs before step 11, ms/seed (noisy machine, ±20%):

| dungeon | before | off | on |
|---|---|---|---|
| l-1 | 34 | 35 | 45 |
| l-3 | 519 | 699 | 140 |
| l-7 | 13 | 17 | 44 |
| m-1 | 55 | 79 | 57 |
| m-3 | known 0/5 | known 0/5 | **5/5**, 1351 |
| m-5 | 332 | 401 | 92 |

Every other dungeon passes in all three, under 30 ms/seed. Without corridors the layouts are
byte-identical to `dev` (hash over all bench layouts). Corridors on: `0 failing, 0 known`.

`/code-review` fixed: white gap notch at corridor ends (the corridor half of a corridor door's
gap is grey now), stage two ignored the iteration budget, over-corridor spaces summed parallel
segments point by point (10–25% of the corridor bench time), `link()` depended on argument order,
`Link` re-exported from `energy.ts`, no corridor legend entry, uncommented `cornerDistance: 0` in
`corridorShapes`. Not changed: `Context.roomsCanTouch` / `corridorShapes` duplicate config and the
space closure, but `EnergyContext` is energy's interface (its tests build it without a
`LayoutConfig`) and `addCorridor` has no other handle on the corridor shapes.

## Out of scope

- L-shaped or bent corridors (step 12 territory), corridor width > 1, corridor labels.
