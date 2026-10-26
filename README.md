# Dungeon Layout Helper

**version:** 0.1.0

**date:** 2026-10-25

Turns a dungeon graph from [101.02_dungeon_generator](../101.02_dungeon_generator) into a 2D map,
laid out with Ondřej Nepožitek's graph-based algorithm (the one behind
[Edgar](https://github.com/OndrejNepozitek/Edgar-DotNet)): procedural room shapes, doors on every
edge, optional corridors, locks and one-way paths drawn on the map.

Status: in progress, engine step 1 (normalize) done. See [STATUS.md](STATUS.md) and [docs/design.md](docs/design.md).

## Install

Requires Node 24.

```bash
$ npm install
```

## Usage

Planned, not implemented yet.

1. Generate a dungeon with its JSON export (schema 2) in the generator project

   ```bash
   $ uv run python dungeon_generator_cli.py --size L --seed 444 --theme tor-barrow \
       --json ruin.json --key ruin.md
   ```

2. Lay it out and save the map

   ```bash
   $ npm run cli -- ruin.json --output ruin-map.svg [--layout-seed N] [--corridors]
   ```

   The layout seed defaults to the dungeon seed, so the same JSON gives the same map. Room numbers
   and names match the GM key (`ruin.md`).

3. Or open the viewer, load the JSON, reroll and export SVG

   ```bash
   $ npm run dev
   ```

## Development

```bash
$ npm run typecheck
$ npm test
```

Branches: `main` (prod), `dev` (integration), `feature/<slug>` off `dev`.

## Layout

```
src/engine/    graph → layout, pure TS (no DOM, no Node APIs)
src/render/    layout → SVG
src/cli/       Node CLI
src/viewer/    Vite web viewer
tests/         vitest, fixture tests/fixtures/ruin.json
docs/          design
ref/           sample generator output; ref/120370675/ (thesis + Edgar source) is git-ignored
```

## References

- Ondřej Nepožitek, *Procedural Level Generator with Unity Integration*, master thesis, Charles
  University (2020).
- Edgar-DotNet, MIT licence, the reference implementation.
- Ma et al., *Game level layout from design specification*, Eurographics 2014.
