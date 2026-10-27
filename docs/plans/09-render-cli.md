# Step 9: render and CLI

Branch `feature/render-cli` off `dev`. STATUS step 9; design: `docs/design.md` §7 and modules.
Style: `ref/webdesign/design.md` (teenage engineering).

## Decisions (2026-10-27)

- **Neutral rooms, amber for gates.** Rooms are white on `#f6f8f7` with 1 px black hairlines; type
  shows through size and glyph, not fill. Amber is the one chromatic note: locks and state gates.
  Replaces "colour by type" in design §7 (the TE style allows colour only for state).
- **Labels in a key column.** Rooms hold only their number; the labels go in a numbered list beside
  the map, catalogue style. Rooms are 3–10 grid units, labels up to ~40 characters: inside a room
  they would be truncated. Replaces "`label` small" in design §7.
- **PNG with `@resvg/resvg-js` 2.6.2**, pinned, prod dependency, imported by the CLI only.

## Change

- `engine/index.ts`: `generate(json, seed, config) → { graph, layout }` (normalize → faces →
  chains → pool → layout). Used by the CLI now and by the viewer in step 10.
- `DungeonJson`: optional `grammar`, `size`, `theme` (present in the export, used by the title).
  Type only; the schema is unchanged.
- `render/svg.ts`: `render(graph, layout, meta) → string`, pure (no DOM, no Node APIs).
  - Grid unit 24 px, y down as in the engine. Map, then key column, then legend.
  - Rooms: polygon, number in weight 300. START and GOAL markers.
  - Doors: a canvas-coloured gap of `doorLength` across the wall plus two jamb ticks (touching rooms
    both draw the shared wall; the gap covers both). Secret: dashed gap.
  - Gates (lock, state, on, off): amber tag with a letter on the door; the key column lists letter,
    kind and object names. Changed while building: object names at the door overlapped rooms and
    walls, the same reason the labels moved to the key.
  - One-way: chevron across the door, pointing `a → b`.
  - Room icons (`render/icons.ts`): 1 px line glyphs, no fill: key, boss key, item, switch, lever,
    treasure (`gb`).
  - Title: dungeon seed, theme, size, layout seed.
  - Doors between the same two rooms share a segment; drawn once, all gate names listed.
- `cli/main.ts`: `npm run cli -- ruin.json [-o ruin-map.svg|.png] [--layout-seed N]`. Format from
  the extension, default `<input>-map.svg`. Errors (`NonPlanarError`, `LayoutError`, schema,
  arguments) print the message and exit 1, no stack trace. No `--corridors` until step 11.

## Tests first

- `render`: SVG snapshot of the fixture at its seed; one room polygon per room, every room number
  and label once, one door mark per distinct door segment, 3 lock and 1 state tag, a chevron per
  one-way door pointing a → b; same input → same string.
- `cli`: argument parsing (defaults, `--layout-seed`, bad values); SVG and PNG written to a temp dir;
  an input error (schema) exits 1 with the message only. A real `LayoutError` takes seconds (M-3),
  so it is not tested through the CLI; it goes through the same catch.
- `engine/index`: `generate` equals the hand-chained pipeline.

## Done when

- `npm run typecheck`, `npm test` clean. No engine layout change, so no bench.
- `npm audit` clean after adding resvg.
- `docs/design.md` §7 and open points, README usage, `STATUS.md` updated in the same commit.

## Out of scope

- Viewer (step 10), corridors (step 11), embedded fonts (font stack: Inter, then system sans).
