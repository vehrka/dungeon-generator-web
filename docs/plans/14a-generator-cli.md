# Step 14a: generator in the CLI, GM key, bench

Branch `feature/generator-cli` off `dev`. STATUS step 14 (first half; viewer in
`14b-generator-viewer.md`). Context: `ref/generator-port.md`, `docs/plans/13-generator-core.md`.

## Decisions (2026-10-27)

- **Step 14 split in two.** 14a: CLI, GM key, bench, docs and open points. 14b: viewer. Two
  branches, two `/code-review`s.
- **One CLI command, no subcommand.** A positional JSON loads a file as today; `--dungeon-seed`
  generates. Both, or neither → error. No random seed when generating (no `Math.random`): the seed
  is required.
- **Layout seed defaults to the dungeon seed** in both modes (same rule as `json.seed` today).
- **Key works on any schema 2 JSON**, generated or loaded; `--json` only when generating (a loaded
  file is already on disk).
- **Key from the JSON, not from `normalize`.** `normalize` drops gate ids, and the key groups doors
  by gate. Port `_exits` over JSON nodes and edges, one gate hop (gate chains are rejected, step
  13). Golden test: `ref/ruin.md` is the Python key of `tests/fixtures/ruin.json` (same file),
  copied to `tests/fixtures/ruin-key.md`; byte-equal output.
- **Bench: committed set unchanged** (regression set, `docs/design.md` numbers refer to it).
  Generated dungeons in their own mode, built on the fly (deterministic, not committed).

## Change

- `src/render/key.ts` `dungeonKey(json: DungeonJson): string`, port of `utils/dungeon_key.py`:
  header (`grammar`, seed, size, theme, room count, solvable), unsolvable reasons, rooms by number
  with exits (gate conditions `locked: …`, `… ON`, `… OFF, open at start`, `secret`,
  `needs …`; `one-way`), keys table (found in, opens, `(ON)`/`(OFF)`/`(+ other)` suffixes). Exits
  as Python `_exits`: walk sorted by id, first path to a room kept (parallel doors). Pure TS, no
  Node APIs (14b uses it in the browser). In `render/` next to `svg.ts`: an output, and not
  generator-specific.
- `src/cli/main.ts`:
  - `npm run cli -- ruin.json [-o …] [--layout-seed N] [--no-corridors] [--key ruin.md]`
  - `npm run cli -- --dungeon-seed 7 [--size M] [--theme classic] [--json m-7-classic.json]
    [--key m-7-classic.md] [-o …] [--layout-seed N] [--no-corridors]`
  - `--size` any case of `XS S M L`, default `M`; `--theme` one of `THEMES`, default `classic`;
    `--size`/`--theme` without `--dungeon-seed` → error. Seed rule `seedFromText`.
  - Default output when generating: `<size>-<seed>-<theme>-map.svg` in the working directory
    (lower-case size, e.g. `m-7-classic-map.svg`); the same base name in 14b.
  - `CliArgs` becomes `{ source: { input } | { generate: GenerateOptions }, output, json?, key?,
    layoutSeed, corridors }`. Log line adds the dungeon seed, size and theme when generated.
- `bench/run.ts` `--generated`: dungeons `gen-<size>-<seed>`, sizes M and L, seeds 1–8 from
  `generateDungeon` (default theme), instead of `bench/dungeons`. Same pass rule, same output line,
  name filter applies. `knownFailures` keyed by name, per corridor mode, as today. Combines with
  `--no-corridors`.
- Close open points in `STATUS.md`: gate chains (asserted in the generator; `normalize` keeps
  rejecting as a guard for hand-edited JSON) and mixed one-way gates (fixed in the generator;
  `normalize` error kept as guard). Remaining generator points (solvability state search,
  parallel doors) stay open.
- Project `CLAUDE.md`:
  - Intro: the app generates (TS port of the Combined grammar, `src/engine/generator/`) and lays
    out; schema 2 JSON is the interchange format.
  - Layout: `src/engine/generator/`, `src/render/key.ts`, `bench --generated`.
  - Conventions: `GeneratorConfig` (`generator/config.ts`) holds generator constants, Python's
    default unless a comment says why; `LayoutConfig` for layout only.
  - Don't: replace "don't change the generator or its schema" with "Python generator is frozen,
    reference only; the TS generator is canonical. Don't change schema 2 without asking (loaded
    files must keep working)". Drop the `normalize` workaround rule (issues fixed at the source).
  - Commands: `npm run bench -- --generated`, CLI generate example. Healthy run lines for the
    generated set once measured.

## Tests first

- `key`: golden `ruin.json` → `ruin-key.md` byte-equal; small hand-built JSONs for each gate
  condition, one-way exit (`a → b` listed only from `a`), multi-requires suffix, `on`/`off`
  suffix, no objects → no keys table, unsolvable reasons listed.
- `cli` `parseCli`: generate mode defaults (size M, theme classic, output name), size case,
  unknown size/theme, file + `--dungeon-seed` → error, `--size` without seed → error, `--json`
  with a file → error, bad seed. `main`: generate writes SVG, JSON (parses, `seed` matches) and
  key; same args twice → byte-identical files; `--key` with a file input.
- Existing CLI tests unchanged and green.

## Commits on the branch

1. `feat(render): GM key in Markdown` (key + golden).
2. `feat(cli): generate dungeons, JSON and key export`.
3. `feat(bench): generated dungeons` + measurements in the body.
4. `docs: generator rules in CLAUDE.md, close generator open points` (with README, design,
   STATUS).

## Bench

- Committed set, both corridor modes: no engine change, must match `dev` (`0 failing, 0 known`;
  `--no-corridors` `0 failing, 1 known`). Report the table.
- `--generated`, both modes: report the table. A failing generated dungeon is a finding, not a
  blocker: record it in `knownFailures` with the stuck rooms and a reason, add it to STATUS open
  points, and ask before any engine change.

## Done when

- typecheck, tests, build clean; bench as above.
- `/code-review` before merge; findings fixed or recorded.
- README usage (generate step replaces the Python command; Python flow kept as "load a JSON"),
  `docs/design.md` (pipeline: generate → JSON → layout → SVG/key; modules), `STATUS.md` updated in
  the same commit as the docs change.

## Out of scope

Viewer (14b), random dungeon seed, PNG of the key, Markdown → PDF, a weight per shape family,
`roomsCanTouch` false.
