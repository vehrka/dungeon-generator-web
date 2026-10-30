# Delve Generator: Dyson map style

A second map style, after Dyson Logos' hand-inked dungeon maps
(https://dysonlogos.blog/maps/commercial-maps/): black ink on white, thick walls, hatched rock
around the rooms, a faint grid on the floors. The plain style (`docs/design.md` §7,
`ref/webdesign/design.md`) stays as it is and fits the cyber theme; zelda, any other theme and a JSON
without a theme get the Dyson style. Decided 2026-10-27.

This file is the source of truth for the Dyson style. `docs/design.md` covers everything else
(engine, layout, plain render, CLI, viewer) and links here from §7. Progress: `STATUS.md`.

## Scope

- Render only. Engine, layout, schema 2, GM key and bench do not change. Same JSON + layout seed
  gives the same layout in both styles; only the drawing differs.
- In: style selection (render, CLI, viewer), floors, grid, walls, rock hatching, doors and gate
  symbols, numbers, glyphs, key column and legend in the Dyson look, hand-drawn wobble.
- Later (own step, ask first): dressing that is not in the JSON (stairs, columns, rubble, water).
- Out: copying Dyson's maps, symbols sheets or fonts. Emulate the look with our own drawing code;
  a style is free, his map files are not. No raster textures, no web font in the SVG, no new
  dependency.

## Constraints from the project

- `render` stays pure: no DOM, no Node APIs; the viewer worker and the CLI call it.
- All randomness through `rng(layoutSeed, "render/<name>")` (`engine/rng.ts`); never
  `Math.random`. Same JSON + layout seed + style → byte-identical SVG (snapshot test).
- Plain output must stay byte-identical: its snapshot (`tests/__snapshots__`) is the guard for
  the refactor.
- Exported SVG must render anywhere (browser, resvg 2.6.2 for PNG, Inkscape): plain SVG 1.1
  features only. resvg supports `pattern`, `clipPath`, `mask`, stroke joins; avoid filters
  (`feTurbulence`/`feDisplacementMap` render differently between engines and are slow in resvg).
- Every JSON value stays escaped (labels, room numbers, gate kinds; `esc` in `svg.ts`).
- Style constants (hatch depth, stroke lengths, wobble, colours) are render constants at the top of
  the Dyson module, like `unit` and `margin` in `svg.ts`. Not in `LayoutConfig`: they never touch
  layout.

## Current renderer (what we build on)

`src/render/svg.ts` (235 lines), `render(graph, layout, meta) → string`, `draw(json, layoutSeed,
config) → { svg, rooms }`:

- Grid unit 24 px, margin 33, title band 66, key column right of the map (gap 66).
- Room outlines: `translate(pl.shape.outline, pl.at)`, integer grid coordinates, axis-parallel
  polygons (rectangles, L, T, plus). `partition(outline)` / `partition(outline, "rows")` cut them in
  rectangles; the number goes in the middle of the largest one.
- Corridors: one polygon per distinct `corridorKey` (`shape.id@x,y`); doors between the same two
  rooms share a segment or a corridor and are grouped (`groups`), one mark and one gate tag per
  group.
- `side(room, segment)` says on which side of a door segment a room lies (needed for one-way
  chevrons and corridor ends).
- Doors: white gap + 2 jambs; secret dashed; gates an amber tag with a letter (A, B, …, listed in
  the key column with kind and object names); one-way chevron a → b.
- Glyphs (`icons.ts`): 14 px line symbols for start, goal, key, boss key, item, switch, lever,
  treasure; legend lists only those used.
- Key column: rooms (number, label), gates (tag, text), legend. Width estimated at 7.5 px/char.

Gate kinds (`GateKind`): `lock`, `state`, `on`, `off`, `secret`. Room types used by glyphs: start,
goal, `gb:*` (treasure). Themes: `zelda` (default), `cyber`.

Size of the hatching job, measured on the bench at layout seed 1 (grid cells):

| dungeon | bbox | floor cells | rock cells within 2 of a floor |
|---------|------|-------------|--------------------------------|
| m-1 | 58×46 | 999 | 943 |
| l-1 | 62×52 | 972 | 1059 |
| l-8 | 33×37 | 444 | 473 |

About 1,000 rock cells × ~4 clusters × 3 strokes ≈ 12k line segments for an L map: one `<path>`,
coordinates rounded to 0.1 px, ≈ 300 kB SVG. Rooms are spread out (floor is ~30% of the bbox), so
most of the bbox stays white, as in Dyson's maps.

## Design

### Style selection

- `type MapStyle = "plain" | "dyson"`; `RenderMeta` carries it. `render` keeps plain
  when none is given, so its tests and snapshot stay as they are.
- Default by theme, decided 2026-10-27: `styleFor(theme)` → `"plain"` for `cyber`, `"dyson"`
  for any other theme or none (a loaded JSON may lack one). `draw(json, layoutSeed, config,
  style = styleFor(json.theme))`, so CLI and viewer share the rule. Changed 2026-10-30 with
  neon: cyber → neon, zelda → Dyson, any other theme or none → plain (`docs/design.md` §7).
- CLI: `--style plain|dyson` overrides the theme's default; unknown value → error listing the
  options (same pattern as `--size`, `--theme`). Output name unchanged unless `-o` is given.
- Viewer: a `style` select in the layout section under corridors, preset from the theme
  (generate) or the loaded JSON's theme, changeable by hand. A load always presets; generate
  presets only when the theme changes (case ignored), so a style picked by hand survives reroll,
  layout seed, corridors, size and generate with the same theme. A style change redraws through the worker, which keeps its last
  layout (`layoutCache` in `viewer/state.ts`, layout failures included), so only the render runs; a style
change during a run restarts it. Export name `<name>-map-<seed>.svg` for
  plain, `<name>-map-<seed>-<style>.svg` otherwise.

### Code structure

Split `svg.ts` before adding the second style:

- `render/scene.ts`: style-free geometry from graph + layout, in grid units: room outlines,
  corridor outlines, door groups (segment, corridor segment, gates, secret, one-way direction,
  corridor side), gate letters, number anchor per room, glyph list per room, bbox. Pure data. Done
  (step 1, `docs/plans/15-render-scene.md`). The legend flags `anySecret` / `anyOneway` went in
  step 2: the painters read `s.doors`, so the legend lists secret and one-way only as drawn.
- `render/svg.ts`: `MapStyle`, `styleFor`, `render`, `draw`; the shared frame (key column, title,
  page) and the plain painter. A `Painter` gives CSS, page colour, `pad` (grid units of room
  around the map, 2 for Dyson so the hatching stays on the page) and `paint(scene, px, layoutSeed)
  → { defs, map, legend }`. Plain output byte-identical to step 1.
- `render/marks.ts`: `unit`, `esc`, glyph, gate tag and room-number marks shared by both
  painters; own module so `svg.ts` and `dyson.ts` do not import each other.
- `render/dyson.ts`: Dyson painter (floors, grid, walls, hatching, doors, numbers) and its
  stylesheet. The floors are one `<g id="floors">` in `defs`, drawn three times through `<use>`
  (paper, grid, wall), so fill, grid and wall share every point.
- `render/hatch.ts`: hatching, wobble and wall shadow, pure functions on grid geometry, unit-tested alone.

### Paint order (Dyson)

1. Page white `#ffffff`. Title and key column.
2. Hatching (one `<path class="hatch">`).
3. Floors white: rooms and corridors alike (no grey corridors).
4. Floor grid: the same polygons filled `url(#grid)`, a `<pattern>` 24 × 24 px,
   `patternUnits="userSpaceOnUse"`, origin at the map's grid origin, so lines fall on grid units.
5. Wall shadow, inside the floors (one `<path class="shadow">`, see below), over the grid.
6. Walls: every floor polygon stroked black, ≈ 3 px, `stroke-linejoin: miter`, no fill.
7. Doors and gate symbols (they cut the wall, so after it).
8. Numbers and glyphs.

Rooms that touch share an edge: both draw it at the same place, one wall. That only holds while
the wobble is shared (below).

### Hatching (`hatch.ts`)

Dyson hatching: clusters of 3–4 short parallel strokes, each cluster at its own angle, packed in a
band along the outside of the walls, the band's outer edge ragged.

- Floor test: rasterize floors (rooms + corridors) through `partition` into a dense grid of unit
  cells (`Uint8Array` over the floors' bbox grown by ⌈hatchDepth⌉ + 1): floor, rock to hatch
  (within ⌈hatchDepth⌉ cells of a floor), other rock. Distance of a point to the floor = distance
  to the nearest floor cell within reach. String-keyed sets were 3–4× slower (240 ms on l-1).
- Samples: Poisson-disc (Bridson, deterministic with `rng(layoutSeed, "render/hatch")`), radius
  0.3 unit, over the rock cells to hatch only, restarted in every such cell it has not reached (rock
  enclosed by a ring of rooms is a separate region). Keep a sample when 0 < d ≤ `hatchDepth` (≈ 1.5
  unit); past `0.6 × hatchDepth` keep it with a probability falling linearly to 0 (ragged edge).
- Cluster per sample: angle uniform in [0, π); `randInt(2, 4)` strokes, spacing ≈ 0.12 unit,
  length ≈ 0.45 unit ± 20%, centred on the sample. Strokes may poke into the floor: the floors paint
  over them (step 4), no clipping needed.
- Stroke 0.8–1 px black, `stroke-linecap: round`.
- If clusters read as noise rather than Dyson's tiled look: fill each sample's Voronoi cell with
  parallel lines instead (watabou's One Page Dungeon does this). Needs a Voronoi on ~4k points
  without a dependency; only if v1 fails the eye test.

### Wobble

Lines a touch irregular, as if inked by hand. Done (step 4, `docs/plans/18-dyson-wobble.md`):
`wobble(outline, layoutSeed, amplitude)` in `hatch.ts`.

- Subdivide every floor edge (rooms and corridors) every `wobbleStep` (0.5 unit) in absolute grid
  coordinates; move each cut perpendicular to its edge by up to `wobbleAmp` (0.8 px), signed in
  absolute axes (dy on a horizontal edge, dx on a vertical one), never along the outline's normal:
  two rooms walk a shared wall in opposite directions.
- Whole-unit rule: points on whole grid units stay put, not only corners. A room's corner can sit in
  the middle of a neighbour's edge (T-junction); fixing only own corners would leave a sliver there.
  Every corner is on whole units, so this covers corners too.
- The offset is a hash of the point and the layout seed, the first draw of
  `rng(layoutSeed, "render/wobble/<x>,<y>")` with x, y in whole cuts (twice the grid coordinate), so
  no float formatting in the key; not a draw from a running stream. Two rooms sharing an edge then
  move it the same way: one wall, not two. A running stream would draw a double line on every
  shared wall; this is the main trap of the feature.
- Floor fill, grid and wall use the same wobbled outline through `<use>` (no white slivers);
  points rounded to 0.1 px.
- Doors, gaps and tags stay on the straight segment: the gap's half-width (2.5 px) and the door
  rectangle (4 px) still cover a 1.5 px half-wall plus 0.8 px of wobble. Door ends are on whole
  units, so the wall meets them unmoved.
- Tuned on 1× PNGs of m-1 and l-1: a 0.25 step read saw-toothed, 0.5 px amplitude nearly straight;
  0.5 step at 0.8 px reads hand-drawn. Smooth noise not needed.
- Off switch: amplitude 0 gives the outline back (tests).

### Wall shadow

Dyson's newer maps (e.g. Cairn Tower, 2026) shade the inside of each room along the walls facing
away from the light: a darker grey band under the top walls and beside the left ones, none on the
bottom and right. Decided 2026-10-29, replacing step 4's grey stroke on the rock side.

- Light at compass bearing 330° (NNW, constant `light` in `dyson.ts`); the walls' shadow reaches
  `shadowLength` 0.35 unit away from it, so offset (0.175, 0.303) unit: the top band is 7.3 px
  (5.8 past the half-wall), the left 4.2 px (2.7). 315° would make them equal.
- `wallShadow(floor, offset, open)` in `hatch.ts`: the floor minus itself moved by the offset,
  per floor polygon, so a wall shared by two rooms shades the room below or right of it. Exact on
  unit cells: a cell's top strip is shaded where the cell above (above-left for its first
  offset.x) is not floor, its left strip likewise; strips merged into runs, ~4 rectangles per
  room. Offset must be in (0, 1) on both axes (light from the upper left), else an error.
- Open doors (every symbol but secret, both ends of a corridor) count as floor across, so a
  doorway casts no shadow; a secret door is a wall and does. Each floor opens only its own doors
  (one side of the segment its cell, the other not), so a neighbour's door next to a shared solid
  wall leaves that wall's shadow alone. A door off whole units is an error.
- Straight edges, painted before the wobbled wall, which covers the 0.8 px of difference.
- Measured, layout seed 1: m-1 397 kB, l-1 421 kB, l-8 179 kB (+3–4 kB over the outside band),
  time within noise (l-1 95–103 ms).

### Doors and gates

Door symbols sit on the wall at the door segment (`doorLength` units long). Grouping, tags and
one-way direction come from the scene, as in the plain style. Done (step 3,
`docs/plans/17-dyson-doors.md`); the geometry is in `scene.ts` so the neon painter reuses it.

| door | plain | Dyson |
|------|-----------|-------|
| plain | gap + jambs | white rectangle across the wall, segment − wall long (as the gap, clears corners), 8 px across, 1.5 px black outline |
| corridor end | gap, corridor half grey | the door symbol at room a's end; archway (open gap, filled and gridded like the floor) at room b's end |
| secret | dashed gap | wall unbroken, a bold serif **S** across it, at both ends of a corridor so it does not give the door away |
| lock | amber tag | door rectangle + a bar across its middle along the normal, 12 px; boxed letter tag |
| state, on, off | amber tag | portcullis: gap + 3 dots (r 1.5 px) on the wall line, no rectangle; boxed letter tag |
| one-way | chevron | the same chevron in black, 0.6 unit to room b's side (in the corridor through one) |

- `SceneDoor.symbol`: secret first (every door of the group secret); else any `lock` gate → lock;
  else any other gate (state, on, off, an unknown kind from the JSON) → portcullis; else door. A
  group with lock and state draws as lock; the key column still lists both kinds. A group of a
  secret and a plain or gated door draws as the latter (secret only when all are, as in step 1), so
  the shared passage shows.
- Gate tag (`SceneDoor.tagAt`): black-outlined white square, black serif letter, 0.6 unit from the
  door's middle into room a. `side()` tests the grid cell next to the door, which is in a by
  definition, and 0.6 < 1, so the tag box (0.31–0.89 unit in) is always inside a: the design's
  fallback to b's side is dropped (pinned by a test). Tag and chevron sit on opposite sides.
- Tag collisions: two doors either side of a corner put their tags 0.1 unit apart (4 pairs on
  286 bench and generated maps, layout seeds 1–5, corridors on and off). The later tag moves another
  0.6 unit into a while it overlaps an earlier one, as long as its whole box stays in a and off a's
  number anchor: 0 overlaps after. Too shallow a room keeps the overlap (cosmetic, no error). A tag
  can still touch the other door's rectangle at such a corner. Tags are not checked against other
  doors' chevrons (0 such overlaps on the same maps).
- Paint order: gaps (archways, portcullis), then every door symbol, then every tag and chevron, so
  a tag is never under a neighbouring door's rectangle.
- Legend lists only what is drawn, in this order: door, locked door, portcullis, secret door,
  one-way, gate.

### Type, glyphs, key column

- Font stack, serif, no web font: `'Palatino Linotype', 'Book Antiqua', Palatino, Georgia,
  'DejaVu Serif', 'Noto Serif', serif`. Named fonts first: resvg maps the generic `serif` to Times
  New Roman, not to fontconfig. A bundled hand-lettered font (OFL, via resvg `font.fontFiles` in
  the CLI) is a later option; the exported SVG would still fall back to the stack.
- Room numbers 17 px, regular, black, in the same anchor as the plain style.
- Glyphs: the same `icons.ts` symbols, black, 1.2 px stroke.
- Key column: kept (Dyson's own maps have none, but our maps need labels). Serif, black rules
  (`#000`, 0.5 px) instead of steel grey, no amber. Title and subtitle in the serif.

### Tokens

| token | value | role |
|-------|-------|------|
| ink | `#000000` | walls, hatching, doors, text |
| paper | `#ffffff` | page, floors |
| grid | `#a9bcc6` | floor grid, 0.5 px (blue-grey, tune by eye) |
| shadow | `#999999` | wall shadow inside the floors, light 330°, 0.35 unit (Dyson's grey, sampled) |
| wobble | 0.8 px every 0.5 unit | floor outlines, across the edge |

No other colour. Values tuned against PNG renders of m-1 and l-1 (step 4).

## Measured (step 2)

Layout seed 1, Dyson core (no wobble, shadow or door symbols), Node 24, mean of 10 renders:

| dungeon | plain | Dyson | Dyson SVG |
|---------|-----------|-------|-----------|
| m-1 | 0.7 ms | 67 ms | 366 kB |
| l-1 | 0.6 ms | 78 ms | 390 kB |
| l-8 | 0.3 ms | 32 ms | 166 kB |

Size within target (< 1 MB). Time at the edge: l-1 measures 78–102 ms from run to run on the same
code (machine load); 5,240 clusters, 15,758 strokes, nearly all the time in `hatch`. If the viewer
reroll feels slow: fewer Bridson tries (30 now) or a jittered grid. Doors are plain gaps in the
wall, half a wall short at each end, so a door flush with a corner leaves the other wall whole;
the gaps are filled and gridded like the floors. Until step 3, gate tags and one-way chevrons sit on
the door as in the plain style, and a secret door is the wall unbroken with a bold serif S (white
halo), so no default map loses information while the symbols are pending. On this machine the serif stack falls back to DejaVu Serif
(no Palatino); the 7.5 px/char key column estimate fits it.

## Measured (step 3)

Door symbols on the same three maps, layout seed 1, mean of 10 renders, against `dev` (step 2) on
the same machine in the same session: m-1 90–95 ms (377 → 379 kB), l-1 97–101 ms (401 → 403 kB),
l-8 43 ms (171 → 172 kB). The doors cost ~2 kB and no measurable time; the machine was slower than
in step 2 for both branches. Plain dump (172 bench and generated maps, layout seeds 1–3,
corridors on and off) byte-identical.

## Measured (step 4)

Wobble and shadow, layout seed 1, mean of 10 renders, against `dev` (step 3) in the same session:
m-1 93 ms both (379 → 394 kB), l-1 95 → 99 ms (403 → 417 kB), l-8 42 ms both (171 → 178 kB). About
+15 kB per map from the extra polygon points (the 0.5 step halves the planned ×4), time within noise.
Plain dump (172 bench and generated maps, layout seeds 1–3, corridors on and off)
byte-identical.

## Testing

- Refactor: plain snapshot unchanged; `tests/render.test.ts` passes without edits.
- `hatch.ts`: no sample inside a floor cell or farther than `hatchDepth`; same seed same strokes,
  other seed other strokes; streams independent of the plain (adding hatching changes no
  layout).
- Wobble: a shared edge gives the same points from both rooms (two touching rectangles, one corner
  on the other's edge); whole-unit points fixed; offsets ≤ amplitude, across the edge only;
  amplitude 0 gives the straight outline; deterministic per layout seed.
- Dyson render: standalone SVG; one floor polygon per room and corridor; every room number and
  label once, escaped (same hostile-input test as plain); no amber, no `#e5e5e5`; door symbol
  counts by kind on the fixture (3 lock, 1 state); one-way chevrons point a → b; snapshot of the
  fixture; same input same string.
- `styleFor`: cyber → plain; zelda, any other string, undefined → dyson (until neon, see above).
- CLI: `--style dyson` writes SVG and PNG; default follows the theme; bad style exits 1 with the
  options listed. Existing CLI tests that render a non-cyber dungeon now get Dyson: pass
  `--style plain` where they check plain output.
- Viewer: `state.ts` style parsing and export name.
- By hand: CLI PNG of `bench/dungeons/m-1.json`, `l-1.json` and a generated zelda L, viewed
  side by side with a Dyson map; viewer in both styles. Time and SVG size of l-1 noted here
  (target < 100 ms render, < 1 MB SVG).

No engine change, so no bench run, unless a step touches `engine/`.

## Steps

See `STATUS.md` for the checklist. Order: scene refactor → Dyson core (floors, grid, walls,
hatching, numbers, key column, `--style`) → doors and gates → wobble and shadow → viewer →
(later) dressing. Each step its own branch off `dev`, test first, `/code-review` before merge.

## Risks and open points

- Shared walls doubled by wobble: avoided by the point hash; tested.
- Hatching density vs size: 300 kB per L map is fine for files, maybe heavy for viewer reroll
  speed; measure in the core step.
- Door symbols on L/T arms and short walls: the door rectangle is half a wall short at each end, so
  it clears the corner (`cornerDistance = 0`); checked on m-1, l-1 and a generated zelda L.
- Gate tags beside doors: always inside room a (0.6 < 1 unit); see doors and gates.
- Fonts: the serif stack looks different per machine; the key column width estimate (7.5 px/char)
  must be checked for the serif.
