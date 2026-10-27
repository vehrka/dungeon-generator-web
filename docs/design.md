# Dungeon Layout Helper: design

Generates a dungeon (port of the Combined grammar of `101.02_dungeon_generator`) as schema 2 JSON,
or loads one, and turns it into a 2D map, laid out with Nepožitek's graph-based algorithm. Outputs
an SVG/PNG map and a Markdown GM key (CLI) and an interactive viewer.

Status: design agreed 2026-10-25, checked against the thesis and Edgar source. Engine steps 1–8
(normalize to layout), render + CLI (step 9), viewer (step 10), corridors (step 11) and L/T
shapes (step 12) implemented, generator core (step 13) ported, generator in the CLI, GM key and
bench (step 14a) and in the viewer (step 14b); see `STATUS.md`.

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

- Input: generator JSON, schema 2. From step 13 the generator itself is ported here and becomes
  canonical (`ref/generator-port.md`); schema 2 stays the interchange format.
- Shapes: seeded procedural pool, rectangles first. Then L/T/plus. Caves dropped (2026-10-27).
- Optional corridors.
- Output: SVG (browser and Node), PNG (CLI only), GM key in Markdown, the JSON itself.
- Viewer: generate or load JSON, show map, reroll, export SVG, JSON and GM key.

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
dungeon seed, size, theme ─▶ generateDungeon ─┐
                       file ─▶ JSON.parse ────┴─▶ JSON ─┬─▶ GM key (render/key.ts)
                                                        ▼
JSON ─▶ normalize ─▶ planarity + faces ─▶ chains ─┐
                                                  ├─▶ layout (greedy + SA + backtracking) ─▶ render
layout seed ─▶ shape pool ─▶ configuration spaces ┘
```

The JSON is the seam: generated or loaded, everything after it is the same code. The key reads the
JSON, not the normalized graph, since `normalize` drops the gate ids the key groups doors by.

Each stage is a pure function in `src/engine` (no DOM, no Node APIs), so the CLI, the viewer and the
tests all call the same code.

### 1. Normalize (`engine/normalize.ts`)

Collapse every `room – gate – room` path into one **door edge** between the two rooms:

```ts
type GameObject = { id: string; type: string; name: string };
type Gate = { kind: "lock" | "state" | "on" | "off" | "secret"; requires: GameObject[] };
type Door = { a: RoomId; b: RoomId; oneway: boolean; gate?: Gate }; // oneway: a → b
type RoomGraph = { rooms: Map<RoomId, Room>; doors: Door[]; start: RoomId; goal: RoomId };
```

- Gates must have exactly two neighbours, both rooms. Anything else is an error, not a guess.
- One-way: the direction comes from the edges around the gate. If they disagree, error.
- Room → objects found there (pickups, switches) are kept for icons. Object ids in rooms and gates
  are resolved to `GameObject` (id, type, name), so the renderer can print key names.
- The layout ignores `oneway` and `gate`: they only matter to the renderer.

Fixture `ruin.json` → 26 rooms, 27 doors (3 lock, 1 state), one 3-room one-way loop.

### 2. Planarity and faces (`engine/planar.ts`)

- Edgar tests planarity with Boyer–Myrvold and takes the faces of the embedding
  (`GeneralAlgorithms/Algorithms/Graphs/GraphUtils.cs`).
- We split the graph into biconnected blocks (Tarjan) and embed each block with
  Demoucron–Malgrange–Pertuiset: simple, O(V·E), fine for < 100 rooms. In a biconnected block every
  face is a simple cycle.
- Faces as vertex lists. The **largest face of each block is dropped** as its outer face
  (Edgar drops the largest face of the whole graph, `ChainDecompositions/BreadthFirstChainDecomposition.cs:52`).
  Per block gives the same cycles on clean graphs, but never puts tree rooms in a face or merges two
  cycles into one face, which a whole-graph embedding does when blocks nest.
- Duplicate doors and self-loops are ignored.
- Not planar → `NonPlanarError` with a minimal conflicting door set (edges dropped one by one while
  the rest stays non-planar: a Kuratowski subdivision), named by room number. The user rerolls in
  the generator.

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
   chain, is in no chain, and is in no remaining face (thesis rule; Edgar's code adds such a vertex
   but does not expand from it). Stop at `maxTreeSize = 8`. With this rule two tree candidates
   never overlap, since they could only meet on a cycle.
5. **Merge small trees**: if the picked tree has fewer than 8 rooms, merge other tree candidates
   into it while the total stays ≤ 8.

Cycle rooms are ordered as in Edgar's `GetCycleComponent`: next is the room with a covered or
already ordered neighbour. Output: chains in order, every room exactly once, every room after the
first has a neighbour earlier in the order (so the greedy placement always has an anchor).

### 4. Shape pool (`engine/shapes.ts`)

Our replacement for Edgar's hand-made room templates. A shape is an orthogonal polygon on the
integer grid:

```ts
type Shape = { id: string; outline: Point[] };
type PoolKey = { type: string; extra: number };    // extra: neighbours above hubDegree
type ShapePool = Map<string, Shape[]>;              // poolId "<extra>/<type>" → shapes
```

- Seeded from `seed` (see Seeds). Same seed → same pool.
- Size range per room type, as data in `engine/shapeRules.ts`. Side lengths: `item key bosskey
  switch lever` 3–5; `n e m t p c` and unknown types 4–7; `st exit` 4–6; `em gb` 6–9; `eb gl`
  7–10. `gb: <reward>` types use the `gb` rule.
- Hubs (step 8): a room with more than `hubDegree` (4) distinct neighbours has pool key
  `{ type, extra }` and both size bounds grow by `hubGrowth` (1) per extra neighbour, so its walls
  fit all of them: `n` with 7 neighbours → 7–10. Rooms up to `hubDegree` keep the type's key,
  stream and shapes. Degree only, not neighbour sizes (fine while every bench hub is `n`). Type and
  extra stay separate fields: types are free text (`gb: <reward>`), so a suffix such as `+3` could
  not be parsed back.
- Each family draws from its own PRNG stream per pool key, `rng(seed, "<family>/<type>")`
  (`rect`, `l`, `t`, `plus`), or `"<family>+<extra>/<type>"` for hubs, so adding a family or a room
  type never changes the shapes of another. Shapes with the same outline share an id (`rect-5x3`),
  so configuration spaces are cached once per outline.
- Default pool: 4 rectangles per type (`shapesPerType`), fewer when the size range has fewer.
- L/T/plus (step 12): box w×h from the size rule, arms at least `minArm` (2) thick, every cut-out
  at least `minNotch` (2) deep and wide. L: bar along the top, arm down the left; T: bar along the
  top, stem centred; plus: both bars centred (an odd margin puts the extra cell right or below:
  rotations only, no mirror image). `lShapes`, `tShapes`, `plusShapes` bases per pool
  key (defaults 1, 1, 0), drawn without repeats from every (w, h, arm, arm) the rules allow; a
  family that cannot fit the size range is skipped. Each base adds its distinct rotations, as
  Edgar's default transformations (`ConfigurationSpacesGenerator.cs:379`, no mirroring); id
  `l-6x5-2x3-r1` (box, arms, quarter turns). Equal outlines keep the first id; a plus that is a
  turned plus of an earlier base is redrawn.
- Defaults from a spike over the bench (`docs/plans/12-lt-shapes.md`): plus fails M-3 with
  corridors and doubles the time; 1-deep cut-outs read as dents. With one L and one T base, about
  ⅔ of the placed rooms are not rectangles: a base brings 4 rotations, perturb picks uniformly.
- Stages: rectangles → L/T/plus polyominoes (cave blobs dropped). Each stage only adds families; it does not
  change the earlier ones for the same seed (it does change layouts: σ and the pool differ).
- Pool size per key is small (4 rectangles + up to 8 L/T): configuration spaces grow with pool size
  squared, cached lazily.
- Corridors are shapes too (`corridorShapes`): straight, `doorLength` wide, one per length in
  `corridorLengths` and orientation, doors only on the two ends (`Shape.doorLines`, Edgar's
  `SpecificPositionsMode`). Lengths `[1, 3, 5]`: Edgar's examples use 1 and 2, but on M-3 over 20
  layout seeds `[1, 2]` passes 5/20, `[1, 2, 3]` 14/20, `[1, 3, 5]` 19/20 (`[1, 2, 4, 6]` 19/20,
  `[1, 4]` 18/20, `[1, 3]` 13/20); the gap a corridor leaves is what holds an enclosed pendant tree.
- Edgar's thesis assumes many door positions per room; few door positions make cycles hard
  (thesis 2.4.1). So rooms get doors along whole walls, not fixed points.

The grid is internal. The map is **abstract scale**: no feet or squares are printed.

### 5. Doors and configuration spaces (`engine/doors.ts`, `engine/configSpace.ts`)

**Doors**, Edgar's simple mode (`Doors/SimpleMode/SimpleModeHandler.cs`): `doorLength` and
`cornerDistance`. Every wall of length ≥ `2·cornerDistance + doorLength` becomes a **door line**:
the wall shrunk by `cornerDistance` at both ends, so a door never sits in a corner. As in Edgar, the
line holds door *start* positions: it is shrunk by `cornerDistance + doorLength` at the far end.
Defaults `doorLength = 1`, `cornerDistance = 0`: a door may end flush with a corner. With
`cornerDistance = 1`, 3–5 wide rooms get 1–3 door positions per wall and a third of the benchmark
dungeons fail (see door capacity below).

**Configuration space** of a free shape B relative to a fixed shape A: the set of offsets of B at
which B does not overlap A and a door line of B faces a door line of A of the same length
(`ConfigurationSpaces/ConfigurationSpacesGenerator.cs:227`):

1. For every door line of B and every door line of A in the opposite direction with the same door
   length: rotate both so the pair is horizontal and compute the offset segment where the doors
   overlap by `doorLength`.
2. Drop the offsets where the polygons overlap.
3. Merge duplicates and overlaps between segments.

- Stored as orthogonal segments of offsets, not a point grid (thesis 1.1). Our door lines are
  normalized (from ≤ to), so no rotation: the offsets of a pair are `fixed.line − moving.line`.
- Each space also keeps the door line pair behind each raw segment (Edgar's `ReverseDoors`);
  `doorAt(space, offset)` gives the door on the fixed shape, the middle one where several fit.
- Cached lazily per `(moving.id, fixed.id)`. The fixture's full pool (30 shapes, 900 pairs) takes
  about 125 ms.
- **Over a corridor** (thesis Algorithm 1, `overCorridor`): for every offset of the corridor
  relative to A, add the configuration space of B relative to the moved corridor. Repeat per
  corridor shape, merge, drop the offsets where B overlaps A. No door pairs: stage two places the
  corridor and its doors. Cached per `(moving.id, fixed.id, link)`.
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
  change its shape instead (as Edgar's `PerturbPosition`).
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
- `D`: sum of Manhattan distances between bounding-box centres of neighbours that do not overlap and
  are not at a valid configuration space offset. At least 1 per such pair (Edgar can count 0 when
  two non-overlapping shapes share a centre, which would pass as valid).
- Each room keeps its `A` and `D` (`engine/energy.ts`, `LayoutState`); placing or moving one room
  recomputes only its pairs and updates the others by the difference, as Edgar's `UpdateEnergyData`.
  Bounding boxes and rectangle partitions are cached per outline.
- With corridors: neighbours joined by a corridor add their distance when they are not at a valid
  over-corridor offset (`Constraints/CorridorConstraints.cs`). Edgar adds that as a second exp
  term; we share one distance term, zero on the same layouts. With `roomsCanTouch = false` (Edgar's
  default is true, so is ours), **+1 per pair of rooms without a direct door that touch**, corners
  included (`Constraints/TouchingConstraints.cs`); corridors are exempt.
- Placed corridors sit in the state under ids above every room id: later rooms count overlap with
  them; they have no distance and no touching term.

**Different enough** (`LayoutOperations/AbstractLayoutOperations.cs:215`):
`diff = mean over chain rooms of (5 · manhattan(centre₁, centre₂) / avgSize)² × (4 if the shape
differs, else 1)`, accepted when `0.4 · diff ≥ 1`. That diversity is what makes backtracking useful.
Edgar divides by the number of rooms in the whole graph, not the chain; we keep the chain mean, so
the threshold does not tighten as the dungeon grows.

**Corridors**, two stages (thesis 2.2.1):

- Per room pair (not per door: parallel doors share a corridor), a corridor with chance
  `corridorRate = 0.95` on its own stream `rng(seed, "corridors")`, or a direct door. Edgar puts a
  corridor on every connection; 0.95 keeps a few rooms touching. `corridors: false` gives the
  touching layout of steps 1–10, identical for a seed. A corridor has exactly two neighbours,
  neither a corridor.
- Stage one: corridor rooms are not in the graph; their two rooms use the over-corridor
  configuration space. Chains are unchanged; a corridor goes with the first chain that has placed
  both its rooms (`TwoStageChainDecomposition.cs`).
- Stage two, after each valid layout of a chain, trees included (`AddCorridorGreedily`): each
  corridor of the chain, shapes shuffled, in the maximum intersection of its spaces with both rooms
  (must satisfy 2), first sampled point without overlap. If any corridor fails, the layout is
  dropped, a stage-two failure counts, and annealing goes on; past `maxStageTwoFailures` (10 000)
  without a layout the chain stops.

**Failure**: Edgar runs until cancelled. We cap the total iterations (`maxTotalIterations =
100 000`: annealing trials plus greedy candidate evaluations). Out of budget, one retry from scratch
with 4× the budget on its own PRNG stream (`layout/retry`); if still no layout, `LayoutError` with
the deepest chain reached and its room numbers. No fallback layout. After the energy caching, 100k
iterations take about 1–1.5 s on 30–40 rooms.

```ts
type Placement = { room: RoomId; shape: Shape; at: Point };
// one per graph door, same order; through a corridor, segment is on room a, corridor.segment on b
type PlacedDoor = { door: Door; segment: Segment; corridor?: { shape: Shape; at: Point; segment: Segment } };
type Layout = { placements: Placement[]; doors: PlacedDoor[] };
```

`PlacedDoor` holds the grid segment of each door (`doorAt` on the configuration space of the two
rooms, or of each room and its corridor, in layout coordinates) and the `Door` itself (gate,
one-way), so the renderer never re-derives geometry. The renderer draws corridors steel gray
(`#e5e5e5`), gate tag and one-way chevron at room a's end, a plain door at room b's.

### 7. Render (`render/svg.ts`)

`render(graph, layout, meta) → string` (SVG). It depends only on the engine types, not on the DOM.
`draw(json, layoutSeed, config) → { svg, rooms }` runs `generate` and `render` with the title meta from
the JSON; the CLI and the viewer both draw through it. Every value taken from the JSON is escaped
(labels, names, room numbers, gate kinds: the JSON is not type-checked at runtime).
Style: teenage engineering (`ref/webdesign/design.md`). Decided 2026-10-27, plan
`docs/plans/09-render-cli.md`.

- Map on the left, key column on the right (rooms, gates, legend), title on top: theme, size,
  dungeon seed, layout seed, grammar. Grid unit 24 px.
- Rooms: white with a 1 px black hairline on `#f6f8f7`, no fill by type: type shows through size
  and glyph. The number sits in the room (weight 300); the `label` goes in the key column, since
  labels of up to ~50 characters do not fit 3-unit rooms.
- Doors: a gap of `doorLength` across the wall with a jamb at each end. Secret doors dashed.
- Gates: an amber tag with a letter on the door (amber is the one colour, kept for state); the key
  lists each letter with the gate kind and its object names (`A  lock  bronze key 1`). Doors between
  the same two rooms share a segment: one mark, one tag for all their gates.
- One-way: chevron across the door pointing `a → b`, moved past the tag on gated doors.
- Room glyphs (`render/icons.ts`, 1 px line, no fill): start, goal, key, boss key, item, switch,
  lever, treasure (`gb`). Unknown object types draw as items. The legend shows only what the map
  uses.
- Fonts: Inter, then common sans fonts by name (resvg maps `sans-serif` to Arial, not to
  fontconfig). No embedded font; the key column width is estimated at 7.5 px per character.

PNG: the CLI rasterizes the SVG with `@resvg/resvg-js` 2.6.2 (system fonts).

GM key (`render/key.ts`): `dungeonKey(json) → string`, port of Python `utils/dungeon_key.py`, byte
equal on `ruin.json` (golden `tests/fixtures/ruin-key.md`). Header (grammar, seed, size, theme,
rooms, solvable), unsolvable reasons, rooms by number with exits and gate conditions, then a table
of objects: where found, which doors they open. Exits walk the JSON from each room through gates
to the next room (Python `_exits`), first path kept. Pure TS, for the viewer too (step 14b).

CLI (`cli/main.ts`, step 14a, plan `docs/plans/14a-generator-cli.md`): one command. A positional
JSON loads a file; `--dungeon-seed N [--size M] [--theme zelda]` generates one (both or neither is
an error; the seed is required). `--json` (generating only) and `--key` write the JSON and key
before layout, so a dungeon that fails to lay out can still be inspected. Generated output defaults
to `<size>-<seed>-<theme>-map.svg`, size lower case.

### 8. Viewer (`src/viewer/`)

Vite page (`vite.config.ts`: root `src/viewer`, build to `dist/`), same style. Decided 2026-10-27,
plan `docs/plans/10-viewer.md`.

- Step 14b (plan `docs/plans/14b-generator-viewer.md`), after dungen.app's result page: map left,
  settings panel right (sticky, stacks under the map below 800px), one graphite helper line per
  control. Panel: result band (name, rooms, seeds, ms; errors in amber, message only; exports svg,
  json for a generated dungeon, key `.md`; first so errors and exports stay in view), dungeon
  (seed, size, theme, generate), layout (seed, reroll, corridors), file (load JSON or drop on the
  map). Opens with M, zelda, seed 1.
- Look of TE's product guides: all capitals, dark numbered section bands, underlined text actions.
  Font Jura (OFL, self-hosted Latin subset in `src/viewer/fonts/`) standing in for TE's TechnoType;
  the SVG map keeps its own font stack.
- Generation runs in the worker with the layout; the reply carries the JSON drawn, so exports match
  the map shown. A theme change keeps the layout seed (theme is text only), a size change or a new
  dungeon seed resets it to the dungeon seed. Size and theme select values are validated.
- Layout runs in a Web Worker (`worker.ts`): a failing layout takes ~2.7 s per seed (M-3). Each run
  terminates a busy worker, so a reroll or a new dungeon cancels a stuck layout.
- Generate = a random dungeon seed, reroll = a random layout seed (step 14b; reroll was seed + 1),
  each written into its field first, so any map can be typed back; Enter in a field runs the typed
  seed. `crypto.getRandomValues` in the viewer only; the engine never draws randomness outside
  `rng(seed, stream)`.
- Logic in `state.ts` (no DOM, tested); `main.ts` only wires the DOM. A file that is not a JSON
  object is rejected by name; the rest is `normalize`'s schema check. The map goes in with
  `innerHTML`, safe because `render` escapes the JSON's values. No PNG export (resvg is Node-only).

### 9. Generator (`engine/generator/`)

Port of the Combined grammar of `101.02_dungeon_generator` (commit `539c76c`), canonical here
since step 13; decisions and Python baseline in `ref/generator-port.md`, plan
`docs/plans/13-generator-core.md`. `generateDungeon({ seed, size, theme })` gives schema 2 JSON,
the same that `normalize` reads; in the CLI since step 14a, in the viewer since step 14b.

- `graph.ts`: directed multigraph, stable ids in insertion order (replaces igraph; order, not
  index parity, is what expansion and merging depend on). `simplify`, undirected Dijkstra.
- `grammar.ts`, `themes.ts`: rules, `PACING`, `FINISH`, 4 themes, `ROOM_STYLE`; data dumped from
  Python into typed literals.
- `expand.ts`: START, GOAL, the `Start` rule, then the first non-terminal in vertex order, R last
  (pacing by progress START → boss, last tier within `nearBoss` steps of `em`/`eb`). One d20 per
  expansion from `rng(seed, "generator/d20")`; theme never draws. Past `maxNodes` (300) or
  `maxIter` (200) recursive rules take their `FINISH` variant. Objects `<type>-<n>`, named
  `<theme name> <n>`. Gate kind stored on the vertex.
- `reduce.ts`: merge two-way joined plain rooms of one type (`e n p t c`) without objects, then
  `simplify`; directed, so `a→b` and `b→a` both stay (parallel doors lay out fine).
- `solve.ts`: explore from START collecting objects; reasons; steps (gate = 1 step).
- `json.ts`: dense ids in vertex order, numbers BFS from START over room–room and room–gate–room
  links (by id), labels from the theme, else `SPECIAL_ROOMS`, `gb:`, pickup, switch, lever,
  `ROOM_STYLE`, name.
- `GeneratorConfig` (`generator/config.ts`), not `LayoutConfig`: separate stage and seed.

Changes from Python, all errors explicit:

- Both legs of a gate share `oneway` (Python made the leg out of the gate two-way, which
  `normalize` rejects: M 8/500, L 52/500).
- `reduce` asserts no gate–gate edge (the grammar cannot make one).
- `reduce` never merges the two ends of one gate. A same-type room loop around a gate otherwise
  collapses into one room holding the gate (L seed 421, 1 of 2000; layout fails on the self-door).
- Generation throws if the dungeon is unsolvable (by construction it is not).

Seeds 1–500 per size: 0 unsolvable, all accepted by `normalize` and planar, rooms (p10 / median /
p90) XS 6/6/8, S 10/13/19, M 13/18/31, L 17/26/44 against Python 6/6/8, 10/13/19, 12/18/29,
16/26/44. ~2 s for all 2000.

## Seeds

- The dungeon seed (with size and theme) gives one dungeon; required to generate, no random seed.
- The layout seed defaults to `json.seed` (the dungeon seed when generating), so one dungeon gives
  one map.
- `--layout-seed N` (CLI) and the seed field and reroll button (viewer, random seed) override it.
- Seeds are 32-bit unsigned integers (`isSeed`, `engine/rng.ts`), shared by CLI and viewer.
- One seeded PRNG (e.g. mulberry32) passed explicitly into every stage. No `Math.random`.
- The same JSON and seed always give the same SVG (tested by snapshot).

## Configuration

All the constants above live in one `LayoutConfig` object with Edgar's defaults: `maxTreeSize`,
`mergeSmallChains`, `maxBranching`, `cycles`, `trialsPerCycle`, `maxIterationsWithoutSuccess`,
`maxStageTwoFailures`, `shapePerturbChance`, `differenceScale`, `greedyMaxPoints`, `doorLength`,
`cornerDistance`, `corridorRate`, `roomsCanTouch`, `maxTotalIterations`; plus our own `hubDegree`,
`hubGrowth`, `corridors`, `corridorLengths`, `lShapes`, `tShapes`, `plusShapes`, `minArm`,
`minNotch`.

## Modules

```
src/engine/    types.ts, config.ts, rng.ts, normalize.ts, planar.ts, chains.ts, shapes.ts,
               shapeRules.ts, geometry.ts, doors.ts, configSpace.ts, energy.ts, layout.ts, index.ts
src/engine/generator/   graph.ts, grammar.ts, themes.ts, types.ts, config.ts, expand.ts, reduce.ts,
               solve.ts, json.ts, index.ts
src/render/    svg.ts, icons.ts, key.ts
src/cli/       main.ts     ruin.json | --dungeon-seed [--size] [--theme] → map.svg / .png
                           [-o] [--json] [--key] [--layout-seed] [--no-corridors]
src/viewer/    index.html, style.css, main.ts, state.ts, worker.ts   generate or load JSON, seeds, reroll, corridors, export
tests/         one test file per engine module, fixture ruin.json; tests/generator/ likewise
```

`geometry.ts`: orthogonal polygons, orthogonal segments, segment intersection, polygon overlap
area. Most of the bugs will be here, so it gets the most tests.

- Screen coordinates (y down), like the SVG. Polygons are validated (axis-parallel edges, no
  collinear neighbours, no self-intersection) and stored clockwise from the top-left corner, so a
  wall's outside is on its left; `walls()` gives each edge with its outward normal.
- Overlap area: both polygons split into rectangles by vertical slabs, then rectangle overlaps
  summed. `partition(poly, "rows")` cuts horizontal slabs; the render puts a room's number in the
  largest rectangle of either cut, the long arm of an L or T.
- Segments are sets of grid points: `merge` joins segments on one line that overlap or have no grid
  point between them. `contains` looks a point up. No subtraction: configuration spaces drop
  overlapping offsets point by point. `rotate(poly, quarterTurns)`: clockwise on screen, moved back
  to 0,0.

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
- render: SVG snapshot for the fixture; rooms, numbers, labels, door marks, gate tags, one-way
  direction, glyphs. Key: golden `ruin.json`, each gate condition, one-way, suffixes. CLI:
  arguments in both modes, SVG and PNG output, generated JSON and key, same arguments give the
  same files, errors exit 1.
- generator: grammar ranges cover the d20 per preset, subcritical; solve and reduce as the Python
  tests; expansion deterministic, finish keeps every key; JSON numbers and labels; properties over
  seeds 1–500 per size (solvable, `normalize`, planar, no self-door, room percentiles within ±2
  median / ±4 p10, p90 of the Python baseline).

Run before done: `npm run typecheck`, `npm test`.

Benchmark (`npm run bench`, `bench/run.ts`): the 16 generator dungeons in `bench/dungeons/` (sizes
M and L, seeds 1–8, generator commit 573478c), each laid out with layout seeds 1–5 and
`defaultConfig` (`-- --no-corridors`: without corridors). A dungeon passes when all five lay out; the run exits 1 if any dungeon outside
`knownFailures` fails. Dungeons that `normalize` or planarity reject are reported as skipped.
Known failures (`knownFailures` in `bench/run.ts`, per corridor mode, dungeon → reason and the
step that should fix it; today only M-3 without corridors) print `known` and do not count; a known failure that passes 5/5 (`pass (known: remove)`), is
skipped or has no dungeon file counts as failing, so the list does not go stale. Run it for any change to shapes, doors, configuration
spaces, energy or layout. Not part of `npm test` (about 20 s).

`-- --generated`: the same sizes and seeds from `generateDungeon` (default theme), named
`gen-<size>-<seed>`, built on the fly and not committed; the committed set stays the regression
set. Step 14a: with corridors 14/16 pass, gen-l-7 (1/5, 62 rooms) and gen-m-3 (4/5) known; without
corridors also gen-m-7 (1/5), and gen-l-7, gen-m-3 0/5. Known failures, to review (open points).

## Build order

One feature branch per step, off `dev`, reviewed with `/code-review` before the merge:

1. normalize
2. planarity
3. chains
4. geometry
5. shapes (rectangles) and doors
6. configuration spaces
7. energy and layout (no corridors)
8. shape sizes from door count, then 8b: M-3 known failure, waits for corridors
9. render + CLI, then viewer
10. corridors (done: M-3 5/5 with corridors on, known only without) → L/T (done, plus off); caves
    dropped
11. generator port: core (STATUS 13), then CLI, key and bench (STATUS 14a), viewer (STATUS 14b).
    Context and decisions: `ref/generator-port.md`

## Open points

- Door capacity. Benchmark on 16 generator dungeons (sizes M and L, seeds 1–8, 5 layout seeds
  each; one skipped by `normalize`): the fixture and every dungeon up to ~24 rooms lay out in under
  2k iterations, but 5 of 15 fail at 50k with the defaults. Causes: few door positions with
  `cornerDistance = 1` on 3–5 wide rooms (thesis 2.4.1), hubs with up to 7 doors on rooms of 4–7,
  and short cycle chains (1–2 rooms) that must close a face between already placed rooms.
  `cornerDistance = 0` fixes 3 of the 5; bigger hub shapes fix one more (M-1); M-3 still fails.
  Decided 2026-10-26: `cornerDistance = 0` by default (done), and shape sizes from a room's door
  count as its own step (build order 8).
  `npm run bench` on 2026-10-27, defaults: 13 pass, L-5 skipped, M-1 fails 2 of 5 layout seeds,
  M-3 fails all 5 (M-5 now passes). Spike 2026-10-27: hub #3 (7 doors) at 7–10 makes M-1 5/5;
  M-3 stays 0/5, stuck on tree chain `[26,25,19,17,27,20,31,34]`, which does not hold the hub, so
  not hub size.
  Step 8 done 2026-10-27 (`hubDegree` 4, `hubGrowth` 1): 14 pass, L-5 skipped, M-1 5/5
  (594 → 75 ms/seed), M-3 still 0/5 (1802 → 2579 ms/seed). Not a per-iteration cost: a failing
  run spends the whole budget either way, but with hub shapes more of it goes to annealing trials
  (~200k vs ~130k of 500k, about 11 µs each) and less to greedy evaluations (about 1 µs each).
  M-3 investigated 2026-10-27 (step 8b, `docs/plans/08b-m3.md`). Main cause: a pendant tree inside
  a ring. Rooms 12 and 23 are joined by three disjoint paths (`22`, `7-13`, `21-29`); with touching
  rooms one path lies inside the ring the other two form (Jordan curve), cheapest `22` with its
  pendant tree `31-34`. Cycle chains 3 and 4 close the ring tight: room 31 has 0 free offsets next
  to 22 in every state the planner reached chain 5 from (0/144). Second: cycles before trees
  (Edgar's order too), so the merged tree chain 5 waits for chains 1–4, which crowd its anchors.
  Third: the ring-closing chain `21,29` is short (~5% of its tries give a layout). Placing tree
  parts as soon as they touch a placed room ("early") does not fix M-3 (0/5, stuck on `21,29`) and
  costs M-1 (5/5 → 4/5) and L-7 (18 → 189 ms/seed). Decided 2026-10-27: a corridor-free layout
  cannot leave a cavity in a ring; corridors (build order 10) give that slack. M-3 is a known
  bench failure until then; no engine change. If corridors are not enough: "early" trees, or
  placing an enclosed pendant tree before its ring closes (both ours, not Edgar's).
  Step 11 done 2026-10-27: with corridors (lengths `[1, 3, 5]`) M-3 passes 5/5 (19/20 over seeds
  1–20); still 0/5 without, so it stays a known failure in that mode only.
