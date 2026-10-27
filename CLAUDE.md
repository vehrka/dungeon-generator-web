# Dungeon Layout Helper

Generates dungeons (TS port of the Combined grammar of `../101.02_dungeon_generator`,
`src/engine/generator/`) and lays them out (TS port of Nepožitek's graph-based layout, Edgar).
Schema 2 JSON is the interchange format: generated, or loaded from a file. Plan and progress:
`STATUS.md`. Design, the source of truth: `docs/design.md`.

## Commands

```bash
npm run typecheck   # tsc --noEmit, must be clean
npm test            # vitest, must pass
npm run bench       # layout benchmark, bench/dungeons × layout seeds 1–5; exits 1 if any fails
npm run bench -- m-1 m-3   # only the named dungeons
npm run bench -- --no-corridors   # rooms touch at every door
npm run bench -- --generated      # generated dungeons gen-m-1 … gen-l-8 instead of bench/dungeons
npm run cli -- --dungeon-seed 7 --size M --theme zelda --json m-7-zelda.json --key m-7-zelda.md
npm run dev         # viewer, vite (root src/viewer)
npm run build       # typecheck + viewer build to dist/, must succeed
```

Healthy bench line: `l-1   pass  5/5  28 rooms      45 ms/seed`. Healthy run: exit 0,
`0 failing, 0 known`; with `--no-corridors`, `0 failing, 1 known` (M-3 needs corridors;
`knownFailures` in `bench/run.ts`). `--generated`: `0 failing, 2 known`; with `--no-corridors`
`0 failing, 3 known` (STATUS open points). Run both modes on both sets when touching shapes,
doors, configuration spaces, energy or layout, and report the before/after table.

## Layout

- `src/engine/`: pure TS, no DOM, no Node APIs; `src/engine/generator/` the dungeon generator.
  `src/render/` SVG and GM key (`key.ts`, Markdown), `src/cli/` Node CLI, `src/viewer/` Vite viewer
  (layout in a Web Worker; logic in `state.ts`, tested; DOM checked by hand).
- `tests/`: one test file per engine module, fixture `tests/fixtures/ruin.json`.
- `bench/dungeons/`: Python generator output, M and L, seeds 1–8 (generator commit 573478c, default
  theme), the regression set. Regenerate only on purpose; the numbers in `docs/design.md` refer to
  these files. `bench --generated` builds the same sizes and seeds from the TS generator on the fly.
- `ref/120370675/` (git-ignored): thesis and Edgar-DotNet source.
- `ref/generator-port.md`: decisions, scope, behaviour, fixes and baseline for porting the
  generator (STATUS steps 13–14).
- `ref/webdesign/`: style reference for the SVG render and viewer (teenage engineering, product
  guide look; steps 9–10, 14b): `design.md` (rules), `cssvars` (tokens). Follow it for UI work.

## Conventions

- Port from the thesis; Edgar source only for constants and details. Comments name the Edgar file
  or thesis section a function follows.
- All randomness through `rng(seed, stream)` from `engine/rng.ts`; never `Math.random`. Same
  JSON + seed gives the same layout. One exception, viewer only: generate and reroll pick a seed
  with `crypto.getRandomValues` and write it into the field first, so every map stays reproducible.
- Every tunable layout constant lives in `LayoutConfig` (`engine/config.ts`), with Edgar's default
  unless a comment says why not. Generator constants live in `GeneratorConfig`
  (`generator/config.ts`), with Python's default unless a comment says why not.
- Errors are explicit, no silent fallback: non-planar → `NonPlanarError`, no layout →
  `LayoutError` naming the stuck chain's room numbers.
- Dense code, few comments, one-line "why" comments. Match it.

## Workflow

- One feature branch per STATUS step, `feature/<slug>` off `dev`, test first.
- Before merging a feature branch into `dev`: run `/code-review` on it, fix the findings or record
  why not in the commit body or STATUS open points, then rerun typecheck, tests and (if relevant)
  bench.
- When a decision changes the design, update `docs/design.md` and `STATUS.md` in the same commit.
- Conventional Commits, body explains why.

## Don't

- The Python generator (`../101.02_dungeon_generator`) is frozen, reference only; the TS generator
  is canonical. Don't change schema 2 without asking (loaded files must keep working).
- Don't add dependencies without asking; pin exact versions and run `npm audit`.
