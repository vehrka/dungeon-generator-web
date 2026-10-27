# Dungeon Layout Helper

**version:** 0.1.0

**date:** 2026-10-25

Turns a dungeon graph from [101.02_dungeon_generator](../101.02_dungeon_generator) into a 2D map,
laid out with Ondřej Nepožitek's graph-based algorithm (the one behind
[Edgar](https://github.com/OndrejNepozitek/Edgar-DotNet)): procedural room shapes, doors on every
edge, optional corridors, locks and one-way paths drawn on the map.

Status: in progress, engine (normalize to layout, no corridors), SVG/PNG render and CLI done. See [STATUS.md](STATUS.md) and [docs/design.md](docs/design.md).

## Install

Requires Node 24.

```bash
$ npm install
```

## Usage

Steps 1–2 work; the viewer (step 3) and `--corridors` are planned.

1. Generate a dungeon with its JSON export (schema 2) in the generator project

   ```bash
   $ uv run python dungeon_generator_cli.py --size L --seed 444 --theme tor-barrow \
       --json ruin.json --key ruin.md
   ```

2. Lay it out and save the map

   ```bash
   $ npm run cli -- ruin.json [-o ruin-map.svg | -o ruin-map.png] [--layout-seed N]
   ```

   Output defaults to `<input>-map.svg`; `.png` rasterizes it. The layout seed defaults to the
   dungeon seed, so the same JSON gives the same map. Room numbers and names match the GM key
   (`ruin.md`). No layout found → the error names the stuck rooms; try another `--layout-seed`.

3. Or open the viewer, load the JSON, reroll and export SVG

   ```bash
   $ npm run dev
   ```

## Development

```bash
$ npm run typecheck
$ npm test
$ npm run bench   # layout benchmark over bench/dungeons
```

Branches: `main` (prod), `dev` (integration), `feature/<slug>` off `dev`.

## Layout

```
src/engine/    graph → layout, pure TS (no DOM, no Node APIs)
src/render/    layout → SVG (teenage engineering style, ref/webdesign/)
src/cli/       Node CLI
src/viewer/    Vite web viewer
tests/         vitest, fixture tests/fixtures/ruin.json
bench/         layout benchmark, generator dungeons M/L seeds 1–8
docs/          design
ref/           sample generator output; ref/120370675/ (thesis + Edgar source) is git-ignored
```

## References

- Ondřej Nepožitek, *Procedural Level Generator with Unity Integration*, master thesis, Charles
  University (2020).
- Edgar-DotNet, MIT licence, the reference implementation.
- Ma et al., *Game level layout from design specification*, Eurographics 2014.
