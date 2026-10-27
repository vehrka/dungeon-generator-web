# Step 14b: generator in the viewer

Branch `feature/generator-viewer` off `dev`, after 14a is merged (needs `render/key.ts` and the
generated-name rule). STATUS step 14 (second half). Style: `ref/webdesign/design.md`.

## Decisions (2026-10-27)

- **Two control rows.** Dungeon: size select, theme select, dungeon seed field, **new dungeon**
  button, load JSON (file or drop). Layout: seed field, reroll, corridors. Then exports.
- **New dungeon = dungeon seed + 1** (wraps as reroll), layout seed reset to the dungeon seed.
  Enter in the dungeon seed field generates that seed. Size change generates the same seed at the
  new size, layout seed reset.
- **Theme change keeps the layout seed.** Theme is text only (step 13), so the graph and the
  layout are the same; only labels change.
- **Load and generate replace each other.** A loaded file shows its name and disables nothing; the
  dungeon controls keep their values and generate again on use.
- **Opens with a dungeon**: M, `zelda`, seed 1, layout seed 1. The page is a generator now; an empty
  map on open is a wasted step. (Was: empty until a file is loaded.)
- **Generation in the worker**, with the layout. One cancel path (a new request terminates a busy
  worker), and the reply carries the JSON for export. Generation is milliseconds, so no separate
  progress state.
- **Exports**: SVG (as today), JSON (generated only; a loaded file is already on disk), key
  `.md` (any dungeon, `dungeonKey` runs in the main thread on the JSON it holds).
- **Names**: generated `<size>-<seed>-<theme>` (as the CLI, 14a), loaded the file name without
  `.json`. Files `<name>-map-<layout seed>.svg`, `<name>.json`, `<name>-key.md`.

## Change

- `viewer/worker.ts`: `DrawRequest = { source: { json } | { generate: GenerateOptions }, seed,
  corridors }`; `DrawResult = { json, svg, rooms, ms } | { error }`. A generator error (bad
  options) comes back as `{ error }` like a layout error.
- `viewer/state.ts`: `parseSeed(s, what)` (message names the layout or the dungeon seed),
  `nextSeed` (today's `reroll`, used by both buttons), `dungeonName(options)`,
  `keyName(name)`, `jsonName(name)`, `parseSize`, `parseTheme` (select values validated, not
  trusted).
- `viewer/index.html`, `style.css`: the dungeon row above the layout row; selects styled as the
  existing controls (0 radius, hairlines, no web fonts). Status line: `<name> · <rooms> rooms ·
  dungeon seed N · layout seed M · ms`.
- `viewer/main.ts`: wiring. `dungeon` holds `{ json, name, generated }` from the last reply, not
  from the request, so exports always match the map shown.

## Tests first (`tests/viewer.test.ts`)

- `parseSeed` with both labels; `nextSeed` wraps; `dungeonName` lower-case size, theme;
  `keyName`/`jsonName`/`exportName` for generated and loaded names; `parseSize` and `parseTheme`
  reject unknown values.
- Worker logic stays thin; generation and draw are covered by the engine and CLI tests.

## Done when

- typecheck, tests, build clean. No engine change, so no bench.
- By hand in Chrome (`npm run dev`): opens with M-1 zelda; new dungeon; size and theme change
  (theme keeps the layout); reroll; corridors toggle; load `ruin.json` then generate again;
  a stuck layout cancelled by new dungeon; the three exports open and match the map (key room
  numbers = map numbers).
- `/code-review` before merge.
- README viewer usage, `docs/design.md` (viewer), `STATUS.md` step 14 closed in the same commit.

## Out of scope

Rendering the key in the page, PNG export, URL state (seeds in the query string), random seed
button, `GeneratorConfig` or `LayoutConfig` controls.
