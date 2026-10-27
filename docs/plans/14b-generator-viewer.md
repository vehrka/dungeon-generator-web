# Step 14b: generator in the viewer

Branch `feature/generator-viewer` off `dev`, after 14a is merged (needs `render/key.ts` and the
generated-name rule). STATUS step 14 (second half). Style: `ref/webdesign/design.md`.

Model: dungen.app/dungen (settings form, one generate button, map, downloads), drawn in the
teenage engineering style of steps 9–10, not dungen's.

## Decisions (2026-10-27)

- **Map left, settings panel right**, as the dungen result page. Map pane: white plane, the SVG
  scaled to the pane width, top-aligned with the panel. Panel ~300px, 1px steel-gray rule on its
  left, sticky while the map scrolls. Each control has a one-line graphite helper under it, as
  dungen ("dungeon seed: integer 0 to 2³²−1", "theme: names and labels only, same layout"). Order,
  top to bottom:
  - **result** (dungen's "Seed / Tiles" block): name, rooms, dungeon seed, layout seed, ms; while
    busy "generating…"/"laying out…"; errors in amber, message only. Replaces the status line.
    Then the exports, svg, json, key, in the same band, as dungen's download next to its seed.
    First, not last as on dungen: at the bottom it fell below the fold (1060px on a 927px
    window) and hid errors and exports.
  - **dungeon**: dungeon seed field, size select (`xs s m l`), theme select
    (`zelda cyber tor-barrow tor-dwarf`), **generate** (primary, black).
  - **layout**: layout seed field, reroll, corridors checkbox.
  - **file**: load json (file or drop on the map).

  Below 800px wide the panel stacks under the map. No zoom/pan.
- **Look: TE product guides** (teenage.engineering/guides/ep-35), decided 2026-10-27 after trying
  the first version. All capitals; sections as dark bands (`#231f20`) with a circled number,
  result as the lighter band (`#d1d3d4`); text actions underlined like the guide's links, band
  colour on hover; generate a full-width black block. Font: Jura (OFL, `src/viewer/fonts/`, Latin
  subset woff2, 21 kB, self-hosted, no network) for TE's TechnoType, which is not free. The SVG map
  keeps its own font stack: an exported SVG cannot rely on a web font.
- **Generate = a random dungeon seed, reroll = a random layout seed**, each written into its field
  before the run, so the map stays reproducible. Enter in a seed field runs the typed seed; a blank
  or bad one is an error naming the field. Generate resets the layout seed to the dungeon seed.
  `crypto.getRandomValues`, viewer only; the engine keeps `rng(seed, stream)` as its only source.
  Changed 2026-10-27 after trying it: seeds were typed, reroll + 1 felt like a counter, and next
  (dungeon seed + 1) is dropped.
- **Size change generates** the same dungeon seed at the new size, layout seed reset.
- **Theme change keeps the layout seed.** Theme is text only (step 13), so the graph and the
  layout are the same; only labels change.
- **Load and generate replace each other.** A loaded file shows its name in the result block and
  disables nothing; the dungeon controls keep their values and generate again on use.
- **Opens with a dungeon**: M, `zelda`, seed 1, layout seed 1. The page is a generator now; an empty
  map on open is a wasted step. (Was: empty until a file is loaded.)
- **Generation in the worker**, with the layout. One cancel path (a new request terminates a busy
  worker), and the reply carries the JSON for export. Generation is milliseconds, so no separate
  progress state.
- **Exports**: svg (as today), json (generated only, disabled for a loaded file: already on
  disk), key `.md` (any dungeon, `dungeonKey` runs in the main thread on the JSON it holds).
- **Names**: generated `<size>-<seed>-<theme>` (as the CLI, 14a), loaded the file name without
  `.json`. Files `<name>-map-<layout seed>.svg`, `<name>.json`, `<name>-key.md`.

## Change

- `viewer/worker.ts`: `DrawRequest = { source: { json } | { generate: GenerateOptions }, seed,
  corridors }`; `DrawResult = { json, svg, rooms, ms } | { error }`. A generator error (bad
  options) comes back as `{ error }` like a layout error.
- `viewer/state.ts`: `parseSeed(s, what)` (message names the layout or the dungeon seed),
  `randomSeed` (generate and reroll; replaces `reroll`), `dungeonName(options)`,
  `keyName(name)`, `jsonName(name)`, `parseSize`, `parseTheme` (select values validated, not
  trusted).
- `viewer/index.html`, `style.css`: two-column grid (`main` map, `aside` panel), section labels,
  helper lines, selects styled as the existing controls (0 radius, 1px ink border, no web fonts,
  no shadows). Header keeps the wordmark only.
- `viewer/main.ts`: wiring. `dungeon` holds `{ json, name, generated }` from the last reply, not
  from the request, so exports always match the map shown.

## Tests first (`tests/viewer.test.ts`)

- `parseSeed` with both labels, blank rejected; `randomSeed` in range; `dungeonName` lower-case size, theme; `keyName`/`jsonName`/`exportName` for
  generated and loaded names; `parseSize` and `parseTheme` reject unknown values.
- Worker logic stays thin; generation and draw are covered by the engine and CLI tests.

## Done when

- typecheck, tests, build clean. No engine change, so no bench.
- By hand in Chrome (`npm run dev`), wide and narrow (< 800px): opens with M-1 zelda; generate;
  generate fills the dungeon seed; blank dungeon seed + Enter errors; size and theme change (theme keeps the layout); reroll;
  corridors toggle; load `ruin.json` (json export disabled) then generate again; a stuck layout
  cancelled by generate; the three exports open and match the map (key room numbers = map numbers).
- `/code-review` before merge.
- README viewer usage, `docs/design.md` (viewer: map left, panel right, result block), `STATUS.md` step 14
  closed in the same commit.

## Out of scope

Rendering the key in the page, PNG export, URL state (seeds in the query string), zoom/pan,
dungen's tile size, furnishing, multi-level and VTT wall exports, `GeneratorConfig` or
`LayoutConfig` controls.
