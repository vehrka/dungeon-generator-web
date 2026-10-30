# Step 24: graph view

Branch `feature/graph-view` off `dev`. Graph step 1 in `STATUS.md`. Asked 2026-10-30: not every
dungeon is a place underground (a heist, a city, a chase); the graph itself should be viewable and
exportable, beside the map.

## Goal

`render/graph.ts`: dungeon JSON → SVG of its room graph. Rooms as boxes in layers from START, doors
as edges, gates and one-ways marked as on the map, key column as on the map. Needs `normalize` only:
no planarity, no layout, no layout seed. So it draws a dungeon that fails to lay out, or a
non-planar one. Viewer switch map | graph; CLI `--graph out.svg`. No engine, layout or schema
change, so no bench.

## Decisions

- **Own layered drawing, no dependency** (dagre, elk, Graphviz all ruled out 2026-10-30).
  Sugiyama-lite, deterministic, no randomness:
  1. Group doors by room pair, as the map does (one edge per pair, all its gates on it; secret and
     one-way only when every door of the pair is).
  2. Layer = BFS distance from START over the undirected graph. Reachable rooms only would hide
     bugs: an unreachable room goes in a last layer of its own (a hand-made JSON can have one).
  3. Order inside a layer: start by room number, then 8 barycenter sweeps (down, up), ties by room
     number. Fixed count, so cost is O(sweeps × edges); L dungeons have ~30–60 rooms.
  4. Coordinates: layers left to right (the map's key column sits right too; most screens are
     wide), each layer centred vertically. Constants at the top of `graph.ts`.
  5. Edges between adjacent layers straight; within a layer or skipping layers a quadratic curve
     bowed away from the rooms between, so an edge never runs through a box.
- **Changed 2026-10-30, after the first version: the look of the Python generator's Graphviz
  plot** (top to bottom, GOAL last, colour by room type, pickup and switch shapes, coloured gate
  edges labelled with their objects, no gate letters); see `docs/design.md` § Graph view. The
  first version's look, kept for the record:
- **Look: the plain TE look**, whatever the theme (`ref/webdesign/design.md`): white boxes with a
  1 px hairline on canvas mist, number and glyph row inside (`roomMarks`, the same glyphs as the
  map: start, goal, key, boss key, item, switch, lever, treasure), amber gate tags, black one-way
  chevrons, secret edges dashed. Role shows through the glyphs, no colour by type (amber stays the
  one colour). A neon or Dyson graph: open point, only if asked.
- **Gate letters are the graph's own**, A, B, … in edge order (layer, then position). The map's
  letters follow its door groups, which depend on the layout; the key column of each SVG lists its
  own letters, so each sheet reads on its own.
- **Key column shared with the map**: rooms by number with labels, gates by letter, legend of what
  is drawn. Refactored out of `render()` first (own commit, plain/Dyson/neon output byte-identical).
- Title as the map's: theme, then size, dungeon seed, grammar, and `graph` in place of the layout
  seed.

## Change

- Refactor commit (`refactor(render)`): `keyColumn(rooms, gateLines, legend, x, y)` and the title
  block out of `render` in `svg.ts`, shared by `render` and `graph`. Dumps byte-identical.
- `render/graph.ts`: `graphLayout(graph)` (layers, order, coordinates; exported for tests) and
  `renderGraph(graph, meta)`; `drawGraph(json)` beside `draw`, normalizing and titling from the JSON.
- CLI: `--graph <file.svg>`, written before layout like `--json` and `--key`, so a dungeon that
  fails to lay out still gets its graph. SVG only (PNG of a graph: add if asked).
- Viewer:
  - `VIEW map graph` text actions in the result band, above export; the current one not underlined.
    Kept across generate, load and reroll; not in the URL or storage.
  - Worker `DrawRequest` gains `view`. Graph: generate if needed, `drawGraph`, no layout; reroll and
    corridors stay enabled (they change the map, the graph shows the same).
  - Export svg saves what is shown: `<name>-graph.svg` for the graph (`state.ts` `graphName`).
  - Result band for the graph: name, rooms, dungeon seed, ms; no layout seed.

## Tests first

`tests/graph.test.ts` (one file per render module):
- layers: START layer 0, each room's layer its BFS distance; an unreachable room in a last layer.
- one box per room, one edge per room pair; doors between the same pair share one edge and one tag.
- gate tags on gated edges, letters A, B, … in edge order; key column lists them with
  `kind  names`; secret edge dashed, no tag; one-way chevron points a → b; legend only what is drawn.
- edges never cross a box (no segment or curve sample inside another room's box) on ruin, generated
  M 1–8 and L 1–8.
- draws a non-planar JSON (K5 of rooms) and a dungeon with a stuck layout (bench m-3, no corridors).
- every JSON value escaped (the hostile-input test of `render.test.ts` reused).
- deterministic: same JSON → byte-identical SVG; snapshot on `tests/fixtures/ruin.json`.

`tests/cli.test.ts`: `--graph` writes the SVG, also when layout fails; rejects a non-`.svg` name.
`tests/viewer.test.ts`: `graphName`.

## Byte-identical guard

Plain, Dyson and neon map SVGs dumped from `dev` before the refactor (throwaway script, as in steps
15–23): bench and generated zelda and cyber M and L, layout seeds 1–5. After the refactor commit and
at the end: `diff -r` empty.

## By hand

CLI graphs of ruin, generated zelda M 1, L 2, cyber L 7 (62 rooms, the largest): crossings, curve
bows, tags against chevrons, key column. Viewer in Chrome: switch both ways, generate and load in
graph view, a failed layout still shows the graph, export name. Time of `drawGraph` on L 7 into
`docs/design.md`.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean; dump diff empty.
- `docs/design.md`: new § Graph view (`render/graph.ts`), §7 CLI flag, §8 viewer switch; README
  usage (CLI flag, viewer switch). STATUS graph step 1 ticked.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.
