# Dungeon Layout Helper

TypeScript port of Nepožitek's graph-based layout (Edgar) for the `--json` export (schema 2) of
`../101.02_dungeon_generator`. Plan and progress: `STATUS.md`. Design, the source of truth:
`docs/design.md`.

## Commands

```bash
npm run typecheck   # tsc --noEmit, must be clean
npm test            # vitest, must pass
npm run bench       # layout benchmark, bench/dungeons × layout seeds 1–5; exits 1 if any fails
npm run bench -- m-1 m-3   # only the named dungeons
```

Healthy bench line: `l-1   pass  5/5  28 rooms      39 ms/seed`. Run it when touching shapes,
doors, configuration spaces, energy or layout, and report the before/after table.

## Layout

- `src/engine/`: pure TS, no DOM, no Node APIs. `src/render/` SVG, `src/cli/` Node CLI,
  `src/viewer/` Vite viewer (empty until steps 9–10).
- `tests/`: one test file per engine module, fixture `tests/fixtures/ruin.json`.
- `bench/dungeons/`: generator output, M and L, seeds 1–8 (generator commit 573478c, default
  theme). Regenerate only on purpose; the numbers in `docs/design.md` refer to these files.
- `ref/120370675/` (git-ignored): thesis and Edgar-DotNet source.
- `ref/webdesign/`: teenage engineering style reference for the SVG render and viewer (steps 9–10):
  `design.md` (rules), `cssvars`, `design_tokens`, `tailwind` (tokens). Follow it for UI work.

## Conventions

- Port from the thesis; Edgar source only for constants and details. Comments name the Edgar file
  or thesis section a function follows.
- All randomness through `rng(seed, stream)` from `engine/rng.ts`; never `Math.random`. Same
  JSON + seed gives the same layout.
- Every tunable constant lives in `LayoutConfig` (`engine/config.ts`), with Edgar's default unless a
  comment says why not.
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

- Don't change the generator (`../101.02_dungeon_generator`) or its JSON schema; the user does.
- Don't work around generator issues in `normalize` without asking (see STATUS open points: gate
  chains, mixed one-way gates).
- Don't add dependencies without asking; pin exact versions and run `npm audit`.
