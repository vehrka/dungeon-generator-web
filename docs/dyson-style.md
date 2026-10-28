# Delve Generator: Dyson map style

A second map style, after Dyson Logos' hand-inked dungeon maps
(https://dysonlogos.blog/maps/commercial-maps/): black ink on white, thick walls, hatched rock
around the rooms, a faint grid on the floors. The catalogue style (`docs/design.md` §7,
`ref/webdesign/design.md`) stays as it is and fits the cyber theme; zelda, any other theme and a JSON
without a theme get the Dyson style. Decided 2026-10-27.

This file is the source of truth for the Dyson style. `docs/design.md` covers everything else
(engine, layout, catalogue render, CLI, viewer) and links here from §7. Progress: `STATUS.md`.

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
- Catalogue output must stay byte-identical: its snapshot (`tests/__snapshots__`) is the guard for
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

- `type MapStyle = "catalogue" | "dyson"`; `RenderMeta` carries it. `render` keeps catalogue
  when none is given, so its tests and snapshot stay as they are.
- Default by theme, decided 2026-10-27: `styleFor(theme)` → `"catalogue"` for `cyber`, `"dyson"`
  for any other theme or none (a loaded JSON may lack one). `draw(json, layoutSeed, config,
  style = styleFor(json.theme))`, so CLI and viewer share the rule.
- CLI: `--style catalogue|dyson` overrides the theme's default; unknown value → error listing the
  options (same pattern as `--size`, `--theme`). Output name unchanged unless `-o` is given.
- Viewer: a `style` select in the layout section next to corridors, preset from the theme
  (generate) or the loaded JSON's theme, changeable by hand; redraws without a new layout
  only if cheap to wire, otherwise a normal redraw (layout is deterministic, same map). Export name
  `<name>-map-<seed>.svg` for catalogue, `<name>-map-<seed>-dyson.svg` for Dyson.

### Code structure

Split `svg.ts` before adding the second style:

- `render/scene.ts`: style-free geometry from graph + layout, in grid units: room outlines,
  corridor outlines, door groups (segment, corridor segment, gates, secret, one-way direction,
  corridor side), gate letters, number anchor per room, glyph list per room, bbox. Pure data. Done
  (step 1, `docs/plans/15-render-scene.md`). The legend flags `anySecret` / `anyOneway` went in
  step 2: the painters read `s.doors`, so the legend lists secret and one-way only as drawn.
- `render/svg.ts`: `MapStyle`, `styleFor`, `render`, `draw`; the shared frame (key column, title,
  page) and the catalogue painter. A `Painter` gives CSS, page colour, `pad` (grid units of room
  around the map, 2 for Dyson so the hatching stays on the page) and `paint(scene, px, layoutSeed)
  → { defs, map, legend }`. Catalogue output byte-identical to step 1.
- `render/marks.ts`: `unit`, `esc`, glyph, gate tag and room-number marks shared by both
  painters; own module so `svg.ts` and `dyson.ts` do not import each other.
- `render/dyson.ts`: Dyson painter (floors, grid, walls, hatching, doors, numbers) and its
  stylesheet. The floors are one `<g id="floors">` in `defs`, drawn three times through `<use>`
  (paper, grid, wall), so fill, grid and wall share every point.
- `render/hatch.ts`: hatching (wobble in step 4), pure functions on grid geometry, unit-tested alone.

### Paint order (Dyson)

1. Page white `#ffffff`. Title and key column.
2. Hatching (one `<path class="hatch">`).
3. Wall shadow: every floor polygon stroked light grey, width ≈ 0.6 unit; its inner half is hidden
   by step 4, so a grey band ≈ 0.3 unit is left on the rock side of every wall (Dyson's newer maps).
4. Floors white: rooms and corridors alike (no grey corridors).
5. Floor grid: the same polygons filled `url(#grid)`, a `<pattern>` 24 × 24 px,
   `patternUnits="userSpaceOnUse"`, origin at the map's grid origin, so lines fall on grid units.
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

Lines a touch irregular, as if inked by hand.

- Subdivide every wall edge at a fixed step (0.5 unit) in absolute grid coordinates; move each
  inner point perpendicular to the edge by `wobble(x, y)` ≤ ~0.8 px. Corners stay put.
- `wobble` is a hash of the point and the layout seed (e.g. the first draw of
  `rng(layoutSeed, "render/wobble/<x>,<y>")`), not a draw from a running stream. Two rooms sharing an edge then
  move it the same way: one wall, not two. A running stream would draw a double line on every
  shared wall; this is the main trap of the feature.
- Floor fill, shadow and wall use the same wobbled outline (no white slivers).
- Doors stay on the straight segment; with ≤ 0.8 px of wobble the door symbol still covers the wall.
- Off switch (constant `wobble = 0`) for tests and to compare.

### Doors and gates

Door symbols sit on the wall at the door segment (`doorLength` units long). Grouping, tags and
one-way direction come from the scene, as in the catalogue.

| door | catalogue | Dyson |
|------|-----------|-------|
| plain | gap + jambs | white rectangle across the wall, door length × ≈ 0.35 unit, 1.5 px black outline |
| corridor end | gap, corridor half grey | open gap in the wall (archway), no rectangle; the door rectangle sits at the room-a end |
| secret | dashed gap | wall unbroken, a serif **S** across it |
| lock | amber tag | door rectangle + a short bar across its middle; boxed letter tag |
| state, on, off | amber tag | portcullis: row of 3–4 dots across the gap, no rectangle; boxed letter tag |
| one-way | chevron | the same chevron in black, past the tag |

- Gate tag: black-outlined white square, black letter, serif, beside the door on room a's side
  (offset ≈ 0.6 unit) so it does not cover the symbol. Check collisions on short walls with
  several doors (catalogue open point).
- Legend lists the door symbols the map uses: door, secret door, locked door, portcullis,
  one-way, gate tag.

### Type, glyphs, key column

- Font stack, serif, no web font: `'Palatino Linotype', 'Book Antiqua', Palatino, Georgia,
  'DejaVu Serif', 'Noto Serif', serif`. Named fonts first: resvg maps the generic `serif` to Times
  New Roman, not to fontconfig. A bundled hand-lettered font (OFL, via resvg `font.fontFiles` in
  the CLI) is a later option; the exported SVG would still fall back to the stack.
- Room numbers 17 px, regular, black, in the same anchor as the catalogue.
- Glyphs: the same `icons.ts` symbols, black, 1.2 px stroke.
- Key column: kept (Dyson's own maps have none, but our maps need labels). Serif, black rules
  (`#000`, 0.5 px) instead of steel grey, no amber. Title and subtitle in the serif.

### Tokens

| token | value | role |
|-------|-------|------|
| ink | `#000000` | walls, hatching, doors, text |
| paper | `#ffffff` | page, floors |
| grid | `#a9bcc6` | floor grid, 0.5 px (blue-grey, tune by eye) |
| shadow | `#c8c8c8` | wall shadow band |

No other colour. Values tuned against PNG renders of m-1 and l-1; record the final ones here.

## Measured (step 2)

Layout seed 1, Dyson core (no wobble, shadow or door symbols), Node 24, mean of 10 renders:

| dungeon | catalogue | Dyson | Dyson SVG |
|---------|-----------|-------|-----------|
| m-1 | 0.7 ms | 67 ms | 366 kB |
| l-1 | 0.6 ms | 78 ms | 390 kB |
| l-8 | 0.3 ms | 32 ms | 166 kB |

Within target (< 100 ms, < 1 MB). l-1: 5,240 clusters, 15,758 strokes, nearly all the time in
`hatch`. Doors are plain gaps in the wall, half a wall short at each end, so a door flush with a
corner leaves the other wall whole. On this machine the serif stack falls back to DejaVu Serif
(no Palatino); the 7.5 px/char key column estimate fits it.

## Testing

- Refactor: catalogue snapshot unchanged; `tests/render.test.ts` passes without edits.
- `hatch.ts`: no sample inside a floor cell or farther than `hatchDepth`; same seed same strokes,
  other seed other strokes; streams independent of the catalogue (adding hatching changes no
  layout).
- Wobble: a shared edge gives the same points from both rooms (two touching rectangles); corners
  fixed; `wobble = 0` gives the straight outline.
- Dyson render: standalone SVG; one floor polygon per room and corridor; every room number and
  label once, escaped (same hostile-input test as catalogue); no amber, no `#e5e5e5`; door symbol
  counts by kind on the fixture (3 lock, 1 state); one-way chevrons point a → b; snapshot of the
  fixture; same input same string.
- `styleFor`: cyber → catalogue; zelda, any other string, undefined → dyson.
- CLI: `--style dyson` writes SVG and PNG; default follows the theme; bad style exits 1 with the
  options listed. Existing CLI tests that render a non-cyber dungeon now get Dyson: pass
  `--style catalogue` where they check catalogue output.
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
- Door symbols on L/T arms and short walls: the door rectangle is wider than the gap and may touch
  a corner (`cornerDistance = 0`); check on the bench maps.
- Gate tags beside doors can land in a neighbouring room through a thin wall; prefer room a's side,
  fall back to the other side if a's side is outside a's outline.
- Fonts: the serif stack looks different per machine; the key column width estimate (7.5 px/char)
  must be checked for the serif.
