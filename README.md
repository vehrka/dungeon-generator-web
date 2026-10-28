# Delve Generator

**version:** 0.1.0

**date:** 2026-10-28

Generates a dungeon from a seed and draws it as a map: rooms, doors, corridors, locks, secret doors
and one-way paths, plus a GM key that names every room and what it holds. Runs as a CLI (SVG or PNG)
and as a web viewer. The same seed always gives the same dungeon and the same map.

Status: generator, layout, catalogue map style, GM key, CLI and viewer done; a second map style,
after Dyson Logos' hand-inked maps, in progress. Plan: [STATUS.md](STATUS.md).

## Quick start

Requires Node 24.

```bash
$ npm install
$ npm run dev     # viewer on http://localhost:5173
$ npm run cli -- --dungeon-seed 7 --key m-7-zelda.md   # m-7-zelda-map.svg and its GM key
```

## How it works

```
dungeon seed, size, theme ─▶ generator ─┐
                    JSON file ─▶ parse ─┴─▶ dungeon JSON ──┬─▶ GM key (Markdown)
                                                           ▼
           normalize ─▶ planarity + faces ─▶ chains ─┐
                                                     ├─▶ layout ─▶ SVG / PNG
layout seed ─▶ room shapes ─▶ configuration spaces ──┘
```

1. **Generate.** A graph grammar grows the dungeon from START to GOAL. Each rule rolls a d20 to
   pick a variant (a locked door with its key elsewhere, a switch that opens a gate, a mini-boss, a
   bonus room…), paced so harder content sits closer to the boss. Small rooms of one kind are
   merged, then a solver walks from START collecting keys to prove the GOAL is reachable. Size
   (XS, S, M, L) sets which variants each roll can pick, so how large it grows; the theme
   (`zelda`, `cyber`) only changes names, so a seed gives the same graph with either theme.
2. **The JSON is the seam.** The generator writes the dungeon as JSON
   ([format](docs/design.md#input-schema-2)); the CLI and viewer can also load one from a file.
   Everything after this point is the same code.
3. **Lay out**, after Ondřej Nepožitek's graph-based algorithm (the one behind
   [Edgar](https://github.com/OndrejNepozitek/Edgar-DotNet)):
   - gates become doors between two rooms; the graph must be planar;
   - the graph is split into chains, cycles first, then trees of up to 8 rooms;
   - every room gets a pool of seeded shapes (rectangles, L, T); configuration spaces give the
     offsets where two shapes share a door without overlapping;
   - chains are placed one by one: greedy for trees, simulated annealing for cycles, with
     backtracking when a chain cannot fit. Most doors get a short corridor (`--no-corridors`: rooms
     touch at every door).
4. **Render.** SVG with room numbers, door symbols per gate kind, a key column and a title; PNG via
   resvg in the CLI. The GM key lists rooms, gates and objects, numbered as on the map.

All randomness goes through one seeded PRNG, split into named streams. Dungeon seed + size + theme
give one dungeon; the layout seed (default: the dungeon seed) gives one map of it.

Full design, constants and trade-offs: [docs/design.md](docs/design.md); map style:
[docs/dyson-style.md](docs/dyson-style.md).

## Usage

### CLI

```bash
# generate
$ npm run cli -- --dungeon-seed 7 [--size XS|S|M|L] [--theme zelda|cyber] \
    [--json m-7-zelda.json] [--key m-7-zelda.md] [-o m-7-zelda-map.svg | .png] \
    [--layout-seed N] [--no-corridors]

# or load a dungeon JSON
$ npm run cli -- ruin.json [-o ruin-map.svg | .png] [--key ruin.md] [--layout-seed N] [--no-corridors]
```

Defaults: size M, theme zelda, output `<size>-<seed>-<theme>-map.svg` (or `<input>-map.svg`), layout
seed = dungeon seed (or the JSON's seed). No layout found → the error names the stuck rooms; try
another `--layout-seed`.

### Viewer

```bash
$ npm run dev     # http://localhost:5173
$ npm run build   # static site in dist/
```

Settings sit right of the map. Dungeon: seed, size, theme, generate (random seed, written into the
field; or type one and press Enter). Layout: seed, reroll, corridors. File: load a JSON or drop it on
the map. Export saves the SVG, the JSON (generated only) and the GM key. A theme change keeps the
layout seed (same graph, other labels); a size change resets it.

## How we built it

- **Thesis first.** The layout is ported from Nepožitek's master thesis, *Procedural Level
  Generator with Unity Integration* (Charles University, 2020); the Edgar-DotNet source (MIT) only
  for constants and details. Comments name the thesis section or Edgar file a function follows.
  Edgar's hand-made room templates are replaced by a seeded procedural shape pool.
- **Generator ported, then owned.** The grammar started in a separate Python project; it was
  ported here, its known issues fixed (one-way gates, gate chains, merges across a gate), and this
  TypeScript version is now the only one. Checked by properties and statistics over seeds 1–500 per
  size, not by seed parity. Notes: [ref/generator-port.md](ref/generator-port.md).
- **One step at a time.** Each step of [STATUS.md](STATUS.md) got a written plan
  ([docs/plans/](docs/plans/)), a feature branch, tests first, a code review before merging, and a
  design update in the same commit when a decision changed. Built with Claude Code; the project
  rules are in [CLAUDE.md](CLAUDE.md).
- **Benchmark as the safety net.** A fixed set of 16 dungeons (M and L, seeds 1–8) × layout seeds
  1–5 runs on every change to shapes, doors or layout, with and without corridors, and the same over
  generated dungeons. Known failures are listed, not hidden.

## Contributing

```bash
$ npm run typecheck   # must be clean
$ npm test            # vitest, must pass
$ npm run bench       # layout benchmark; exits 1 if any dungeon fails
$ npm run bench -- --no-corridors
$ npm run bench -- --generated
$ npm run build       # must succeed
```

- **Branches**: `main` (prod), `dev` (integration), `feature/<slug>` off `dev`, one per STATUS
  step. Conventional Commits (`feat(layout): …`), body says why.
- **Tests first.** One test file per engine module in `tests/`. Touching shapes, doors,
  configuration spaces, energy or layout: run the bench in both modes on both sets and put the
  before/after table in the PR.
- **Determinism.** Randomness only through `rng(seed, stream)` (`src/engine/rng.ts`), never
  `Math.random`. Same JSON and seed → same SVG (snapshot tests).
- **Config, not magic numbers.** Layout constants in `LayoutConfig` (`src/engine/config.ts`) with
  Edgar's default; generator constants in `GeneratorConfig` (`src/engine/generator/config.ts`). A
  different default needs a one-line comment saying why.
- **Explicit errors.** Non-planar → `NonPlanarError`, no layout → `LayoutError` with room numbers;
  no silent fallbacks.
- **The JSON format is stable.** Saved files must keep loading; ask before changing it. No new
  dependencies without asking; pin exact versions and run `npm audit`.
- **Docs.** [docs/design.md](docs/design.md) is the source of truth; update it and STATUS with
  the change. UI and map styling follow [ref/webdesign/design.md](ref/webdesign/design.md).

## Layout

```
src/engine/            graph → layout, pure TS (no DOM, no Node APIs)
src/engine/generator/  seed → dungeon JSON
src/render/            layout → SVG; JSON → GM key
src/cli/               Node CLI
src/viewer/            Vite web viewer (layout in a Web Worker)
tests/                 vitest; fixture tests/fixtures/ruin.json
bench/                 layout benchmark; dungeons/ is the fixed regression set
docs/                  design, map style, step plans
ref/                   generator port notes, style reference; ref/120370675/ (thesis + Edgar) git-ignored
```

## References

- Ondřej Nepožitek, *Procedural Level Generator with Unity Integration*, master thesis, Charles
  University (2020).
- [Edgar-DotNet](https://github.com/OndrejNepozitek/Edgar-DotNet), MIT licence, the reference
  implementation.
- Ma et al., *Game level layout from design specification*, Eurographics 2014.
- Dyson Logos, [commercial maps](https://dysonlogos.blog/maps/commercial-maps/), the second map
  style.
