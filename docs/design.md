# Dungeon Layout Helper: design

Turns the `--json` export of `101.02_dungeon_generator` (schema 2) into a 2D map, laid out with
Nepožitek's graph-based algorithm. Outputs an SVG/PNG map (CLI) and an interactive viewer.

Status: design agreed 2026-10-25, checked against the thesis and Edgar source. No code yet.

## References

All in `ref/120370675/`:

- `Thesis/thesis.pdf`: Ondřej Nepožitek, *Procedural Level Generator with Unity Integration*,
  master thesis, Charles University (2020). Chapters 1–2: algorithm, corridors, chain
  decomposition, performance changes. Builds on his 2018 work (not included), which holds the
  energy and annealing details; for those the source is the reference.
- `DotNet/Source`: Edgar-DotNet (MIT, © 2018 Ondřej Nepožitek), the reference implementation.
  Paths below are relative to `DotNet/Source/MapGeneration/Core/`.
- Ma et al., *Game level layout from design specification*, Eurographics 2014: the base work.

We port from the thesis and use the source for constants and details. We do not run the binaries.

## Scope

In v1:

- Input: generator JSON, schema 2.
- Shapes: seeded procedural pool, rectangles first. Then L/T/plus, then irregular caves.
- Optional corridors.
- Output: SVG (browser and Node), PNG (CLI only).
- Viewer: load JSON, show map, reroll, export SVG.

Out of v1: shape parameter tweaking in the viewer, FoundryVTT scene export, real-world scale,
Edgar's room template repeat modes (thesis 2.2.2).

## Input (schema 2)

```jsonc
{
  "schema_version": 2, "seed": 444, "start": 0, "goal": 1, "solvable": true,
  "nodes": [
    { "id": 0, "kind": "room", "type": "st", "objects": [], "number": 1, "label": "Grass-grown portal (START)" },
    { "id": 5, "kind": "gate", "type": "lock", "gate": "lock", "requires": ["WrfcZq1z"] }
  ],
  "edges": [ { "source": 0, "target": 20, "oneway": false } ],
  "objects": [ { "id": "WrfcZq1z", "name": "blessed censer 1", "found_in": [4], "opens": [5] } ]
}
```

- Rooms carry `number` and `label`, the same as in the GM key (`ruin.md`). The map uses both. Node
  ids are internal only.
- Gate kinds: `lock`, `state`, `on`, `off`, `secret`.
- Reject input with `schema_version` other than 2, with a clear error.

## Pipeline

```
JSON ─▶ normalize ─▶ planarity + faces ─▶ chains ─┐
                                                  ├─▶ layout (greedy + SA + backtracking) ─▶ render
seed ─▶ shape pool ─▶ configuration spaces ───────┘
```

Each stage is a pure function in `src/engine` (no DOM, no Node APIs), so the CLI, the viewer and the
tests all call the same code.

### 1. Normalize (`engine/normalize.ts`)

Collapse every `room – gate – room` path into one **door edge** between the two rooms:

```ts
type Gate = { kind: "lock" | "state" | "on" | "off" | "secret"; requires: string[] };
type Door = { a: RoomId; b: RoomId; oneway: boolean; gate?: Gate }; // oneway: a → b
type RoomGraph = { rooms: Map<RoomId, Room>; doors: Door[]; start: RoomId; goal: RoomId };
```

- Gates must have exactly two neighbours, both rooms. Anything else is an error, not a guess.
- One-way: the direction comes from the edges around the gate. If they disagree, error.
- Room → objects found there (pickups, switches) are kept for icons.
- The layout ignores `oneway` and `gate`: they only matter to the renderer.

Fixture `ruin.json` → 26 rooms, 27 doors (3 lock, 1 state), one 3-room one-way loop.

### 2. Planarity and faces (`engine/planar.ts`)

- Edgar tests planarity with Boyer–Myrvold and takes the faces of the embedding
  (`GeneralAlgorithms/Algorithms/Graphs/GraphUtils.cs`). Our graphs are small (< 100 rooms), so we
  pick the simplest correct embedding algorithm (left-right or Boyer–Myrvold) and test it hard.
- Not planar → error naming the conflicting edges. The user rerolls in the generator.
- Faces as vertex lists. The **largest face is dropped** as the outer face
  (`ChainDecompositions/BreadthFirstChainDecomposition.cs:52`).

### 3. Chain decomposition (`engine/chains.ts`)

Thesis 2.3.2, Algorithms 2 and 4. A chain is a list of rooms plus `fromFace: boolean`.

1. **First chain**: the smallest face. No cycles → a tree chain from an arbitrary leaf.
2. **Expand** until every room is covered. For each covered room, look at its uncovered neighbours:
   - neighbour in a remaining face → **cycle candidate**: the uncovered vertices of that face;
   - otherwise → **tree starting point**. All starting points of one covered room form one
     **tree candidate** (start the search from all of them together).
3. **Pick**: any cycle candidate beats any tree. Among cycles, the smallest. Among trees, the one
   whose oldest neighbouring chain has the lowest number, then the largest.
4. **Tree candidates** grow by BFS from the starting points. A vertex joins only if it neighbours the
   chain, is in no chain, and is in no remaining face. Stop at `maxTreeSize = 8`.
5. **Merge small trees**: if the picked tree has fewer than 8 rooms, merge other tree candidates
   into it while the total stays ≤ 8.

Output: chains in order, every room exactly once, every chain after the first neighbours an earlier
one.

### 4. Shape pool (`engine/shapes.ts`)

Our replacement for Edgar's hand-made room templates. A shape is an orthogonal polygon on the
integer grid:

```ts
type Shape = { id: string; outline: Point[] };
type ShapePool = Map<RoomType, Shape[]>;
```

- Seeded from `seed` (see Seeds). Same seed → same pool.
- Size range per room type (e.g. `eb`, `gl` larger, `item`/`switch` small), as data in
  `engine/shapeRules.ts`.
- Stages: rectangles → L/T/plus polyominoes → cave blobs. Each stage only adds families; it does not
  change the earlier ones for the same seed.
- Pool size per type is small (around 3–6 shapes): configuration spaces grow with pool size squared.
- Corridors are shapes too: straight, 1 wide, a few lengths, doors only on the short ends. Short
  corridors on purpose, so stage two rarely fails (thesis 2.2.1).
- Edgar's thesis assumes many door positions per room; few door positions make cycles hard
  (thesis 2.4.1). So rooms get doors along whole walls, not fixed points.

The grid is internal. The map is **abstract scale**: no feet or squares are printed.

### 5. Doors and configuration spaces (`engine/doors.ts`, `engine/configSpace.ts`)

**Doors**, Edgar's simple mode (`Doors/SimpleMode/SimpleModeHandler.cs`): `doorLength` and
`cornerDistance`. Every wall of length ≥ `2·cornerDistance + doorLength` becomes a **door line**:
the wall shrunk by `cornerDistance` at both ends, so a door never sits in a corner.

**Configuration space** of a free shape B relative to a fixed shape A: the set of offsets of B at
which B does not overlap A and a door line of B faces a door line of A of the same length
(`ConfigurationSpaces/ConfigurationSpacesGenerator.cs:227`):

1. For every door line of B and every door line of A in the opposite direction with the same door
   length: rotate both so the pair is horizontal and compute the offset segment where the doors
   overlap by `doorLength`.
2. Drop the offsets where the polygons overlap.
3. Merge duplicates and overlaps between segments.

- Stored as orthogonal segments of offsets, not a point grid (thesis 1.1).
- Precomputed for every pair of shapes and cached, keyed by `(shapeA, shapeB)`.
- **Over a corridor** (thesis Algorithm 1): for every offset of the corridor relative to A, add the
  configuration space of B relative to the moved corridor. Repeat per corridor shape and merge.
- **Maximum intersection** of the configuration spaces of a room relative to several placed
  neighbours (`ConfigurationSpaces/AbstractConfigurationSpaces.cs:65`): try all neighbours, then
  every subset one smaller, and so on, until an intersection is non-empty. Returns the segments and
  how many neighbours it satisfies.

### 6. Layout (`engine/layout.ts`)

**Planner** (`GeneratorPlanners/GeneratorPlanner.cs`): a search tree over chains. Each node
asks the chain's evolver for up to `maxBranching = 5` layouts, lazily. Next to expand: the deepest
node that still has layouts to give. A node with none left is finished, and the search falls back
to a shallower one; that is the backtracking. Done when a layout covers the last chain.

**Greedy placement** (`LayoutOperations/LayoutOperations.cs:113`), per room in chain order:

- The very first room: random shape at `(0, 0)`.
- Otherwise: for each shape (shuffled), the maximum intersection with placed neighbours; on each
  segment sample at most 20 points; keep the shape and position with the lowest energy.

**Tree chains** (`fromFace = false`): greedy only, 2 attempts, no annealing (thesis 2.3.3).

**Cycle chains**: greedy start, then simulated annealing
(`LayoutEvolvers/SimulatedAnnealing/SimulatedAnnealingEvolver.cs`):

- `cycles = 50`, `trialsPerCycle = 100`.
- Temperature from `t0 = −1/ln 0.2` down to `t1 = −1/ln 0.01`, geometric: `t ← t · (t1/t0)^(1/(cycles−1))`
  after each cycle.
- **Perturb** one random room of the chain: 40% change shape (random from its pool), 60% move it to
  a random point of the maximum intersection (segments weighted by length + 1). Nothing satisfied →
  keep the old position.
- **Accept**: always if `ΔE ≤ 0`; else with `p = exp(−|ΔE| / (ΔEavg · t))`. `ΔEavg` starts at
  `15 · |ΔE|` of the first trial and is the running mean of accepted `|ΔE|`.
- **Valid** layout for the chain (energy 0) → if it is **different enough** from the ones already
  returned, run stage two (corridors), and if that works, return it.
- **Stop** when: `maxBranching` layouts returned; more than `maxIterationsWithoutSuccess = 100`
  iterations since the last returned layout (thesis 2.3.4); more than `maxStageTwoFailures = 10000`
  stage-two failures; random restart. Random restart: after a cycle with no new layout, the failure
  count goes up; with more than 8, 6, 4, 2 failures restart with chance 1/2, 1/3, 1/5, 1/7.

**Energy** (`Constraints/BasicConstraint.cs:165`), summed over rooms:

```
E = exp(A / (σ · 625)) · exp(D / (σ · 50)) − 1,   σ = 10 · avgSize
avgSize = mean over all shapes of (bbox width + bbox height) / 2
```

- `A`: overlap area with other rooms.
- `D`: sum of Manhattan distances between bounding-box centres of neighbours that are not at a valid
  configuration space offset.
- With corridors: neighbours joined by a corridor add their distance when they are not at a valid
  over-corridor offset (`Constraints/CorridorConstraints.cs`), and **+1 per pair of non-neighbour
  rooms that touch** (`Constraints/TouchingConstraints.cs`), so corridors have room to go.

**Different enough** (`LayoutOperations/AbstractLayoutOperations.cs:215`):
`diff = mean over chain rooms of (5 · manhattan(centre₁, centre₂) / avgSize)² × (4 if the shape
differs, else 1)`, accepted when `0.4 · diff ≥ 1`. That diversity is what makes backtracking useful.

**Corridors**, two stages (thesis 2.2.1):

- Per door edge, a corridor or not (seeded choice, rate configurable). A corridor has exactly two
  neighbours, neither a corridor.
- Stage one: corridor rooms are removed from the graph; their two rooms use the over-corridor
  configuration space.
- Stage two, after each valid chain: place each corridor of the chain greedily in the intersection
  of its configuration spaces with both rooms, without overlap. If any corridor fails, it counts as
  a stage-two failure and annealing goes on.

**Failure**: Edgar runs until cancelled. We cap the total iterations (`maxTotalIterations`, then a
retry ×4); if still no layout, fail with an error naming the deepest chain reached and its room
numbers. No fallback layout.

```ts
type Placement = { room: RoomId; shape: ShapeId; at: Point };
type Layout = { placements: Placement[]; doors: PlacedDoor[]; corridors: Placement[] };
```

`PlacedDoor` holds the grid segment of each door (from the configuration space line that was used),
so the renderer never re-derives geometry.

### 7. Render (`render/svg.ts`)

`(RoomGraph, Layout) → string` (SVG). It depends only on the engine types, not on the DOM.

- Rooms: filled outline, colour by type (same palette idea as the generator PNG), `number` large
  and `label` small.
- Doors: gap in the wall. Locks get a lock icon and the object name (`bronze key 1`); state gates
  get the state style and the switch names. Secret doors are dashed.
- One-way: arrow across the door or corridor, pointing `a → b`.
- Icons in rooms: pickups (key, boss key, item), switches, treasure (`gb`).
- Legend, plus a title with seed, theme and size.

PNG: the CLI rasterizes the SVG. Library to pick at the render step (e.g. `@resvg/resvg-js`),
pinned and audited.

## Seeds

- The layout seed defaults to `json.seed`, so one dungeon gives one map.
- `--layout-seed N` (CLI) and a reroll button (viewer) override it.
- One seeded PRNG (e.g. mulberry32) passed explicitly into every stage. No `Math.random`.
- The same JSON and seed always give the same SVG (tested by snapshot).

## Configuration

All the constants above live in one `LayoutConfig` object with Edgar's defaults: `maxTreeSize`,
`mergeSmallChains`, `maxBranching`, `cycles`, `trialsPerCycle`, `maxIterationsWithoutSuccess`,
`maxStageTwoFailures`, `shapePerturbChance`, `differenceScale`, `greedyMaxPoints`, `doorLength`,
`cornerDistance`, `corridorRate`, `maxTotalIterations`.

## Modules

```
src/engine/    types.ts, config.ts, rng.ts, normalize.ts, planar.ts, chains.ts, shapes.ts,
               shapeRules.ts, geometry.ts, doors.ts, configSpace.ts, energy.ts, layout.ts, index.ts
src/render/    svg.ts, icons.ts
src/cli/       main.ts     ruin.json → ruin-map.svg / .png  [--layout-seed] [--corridors]
src/viewer/    index.html, main.ts   file input, seed field, reroll, export SVG
tests/         one test file per engine module, fixture ruin.json
```

`geometry.ts`: orthogonal polygons, orthogonal segments, segment intersection, polygon overlap
area. Most of the bugs will be here, so it gets the most tests.

## Testing

Red-green per module, with `ruin.json` plus small hand-made graphs:

- normalize: counts, gate data on the right door, one-way direction, errors on bad gates.
- planar: K4 planar, K5 and K3,3 rejected, faces of a square with a diagonal, outer face dropped.
- chains: every room once, smallest face first, cycles before trees, trees ≤ 8, each chain touches
  an earlier one; the graphs of thesis figures 9 and 10.
- geometry: overlap area, segment intersection and merge.
- doors/configSpace: door lines respect `cornerDistance`; two squares → the expected segments;
  every offset in a space has no overlap and a shared door of `doorLength`.
- energy: zero only for a valid layout; overlap and distance raise it.
- layout: valid layouts (no overlap, every door edge touches) on a path, a cycle, and the fixture;
  determinism for a fixed seed.
- render: SVG snapshot for the fixture.

Run before done: `npm run typecheck`, `npm test`.

## Build order

One feature branch per step, off `dev`:

1. normalize
2. planarity
3. chains
4. geometry
5. shapes (rectangles) and doors
6. configuration spaces
7. energy and layout (no corridors)
8. render + CLI, then viewer
9. corridors → L/T/plus → caves

## Open points

- Default `doorLength`, `cornerDistance` and the size ranges per room type: set at the shapes step.
- `maxTotalIterations` default: set from timings on the fixture.
- PNG library: chosen at the render step.
