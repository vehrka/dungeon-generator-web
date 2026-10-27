# Dungeon Layout Helper

**version:** 0.1.0

**date:** 2026-10-25

Generates a dungeon graph (TypeScript port of the Combined grammar of
[101.02_dungeon_generator](../101.02_dungeon_generator)) and turns it into a 2D map, laid out with Ondřej Nepožitek's graph-based algorithm (the one behind
[Edgar](https://github.com/OndrejNepozitek/Edgar-DotNet)): procedural room shapes, doors on every
edge, optional corridors, locks and one-way paths drawn on the map.

Status: in progress, generator, engine (normalize to layout, with corridors), SVG/PNG render, GM
key, CLI and viewer done; generating from the viewer next. See [STATUS.md](STATUS.md) and [docs/design.md](docs/design.md).

## Install

Requires Node 24.

```bash
$ npm install
```

## Usage

1. Generate a dungeon, lay it out and save the map, its JSON (schema 2) and GM key

   ```bash
   $ npm run cli -- --dungeon-seed 7 [--size XS|S|M|L] [--theme zelda|cyber|tor-barrow|tor-dwarf] \
       [--json m-7-zelda.json] [--key m-7-zelda.md] [-o m-7-zelda-map.svg | .png] \
       [--layout-seed N] [--no-corridors]
   ```

   Size defaults to M, theme to zelda, output to `<size>-<seed>-<theme>-map.svg`; `.png`
   rasterizes it. The same dungeon seed, size and theme give the same dungeon. The layout seed
   defaults to the dungeon seed, so they also give the same map. Room numbers and names match the
   GM key. No layout found → the error names the stuck rooms; try another `--layout-seed`. Most
   doors lead through a short corridor; `--no-corridors` puts every door in a shared wall.

2. Or load a schema 2 JSON (saved with `--json`, or exported by the Python generator)

   ```bash
   $ npm run cli -- ruin.json [-o ruin-map.svg | -o ruin-map.png] [--key ruin.md] [--layout-seed N] [--no-corridors]
   ```

   Output defaults to `<input>-map.svg`; the layout seed to the JSON's seed.

3. Or open the viewer, load the JSON (or drop it on the page), reroll and export SVG

   ```bash
   $ npm run dev     # http://localhost:5173
   $ npm run build   # static site in dist/
   ```

   The layout seed starts at the dungeon seed; reroll steps it by one, or type any seed and press
   Enter. The corridors checkbox lays the same seed out again with or without corridors. Export
   saves `<name>-map-<seed>.svg`.

## Development

```bash
$ npm run typecheck
$ npm test
$ npm run bench   # layout benchmark over bench/dungeons (-- --no-corridors: without corridors)
$ npm run bench -- --generated   # the same over generated dungeons
```

Branches: `main` (prod), `dev` (integration), `feature/<slug>` off `dev`.

## Layout

```
src/engine/    graph → layout, pure TS (no DOM, no Node APIs); generator/ seed → schema 2 JSON
src/render/    layout → SVG (teenage engineering style, ref/webdesign/), JSON → GM key
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
