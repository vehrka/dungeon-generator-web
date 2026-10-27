# Status

**updated:** 2026-10-27

Generator, layout, catalogue render, CLI and viewer done (`docs/design.md`; history in git and
`docs/plans/`). Current work: a second map style after Dyson Logos, design in
[docs/dyson-style.md](docs/dyson-style.md).

## Steps: Dyson map style

One feature branch per step, off `dev`, test first, `/code-review` before merging into `dev`.

- [ ] 1. **scene refactor** (`feature/render-scene`): style-free geometry in `render/scene.ts`
  (outlines, corridors, door groups, gate letters, number anchors, glyphs), catalogue painter reads
  it. Catalogue snapshot byte-identical, render tests unchanged.
- [ ] 2. **Dyson core** (`feature/dyson-core`): `MapStyle`, `styleFor(theme)` (cyber →
  catalogue, else Dyson), `render`/`draw` style argument, CLI `--style`; white page, floors
  (rooms and corridors alike), floor grid pattern, thick walls, hatching (`render/hatch.ts`),
  serif numbers, black glyphs, key column and title in the serif. Doors as plain gaps for now. Measure render time and SVG size on l-1.
- [ ] 3. **doors and gates**: door rectangle, archway at corridor ends, secret S, locked bar,
  portcullis dots, boxed gate tags beside the door, black one-way chevron, legend.
- [ ] 4. **wobble and shadow**: point-hashed wobble on all floor outlines (shared walls stay one
  line), grey wall-shadow band. Tune tokens on PNGs of m-1 and l-1, record them in the design.
- [ ] 5. **viewer**: style select preset from the theme, export name `-dyson` suffix.
- [ ] 6. *(later, ask first)* **dressing**: stairs in the start room, rubble, columns; not in the
  JSON, so drawn from the layout seed.

## Open points

- Generated bench failures, known (`bench -- --generated`): gen-l-7 (62 rooms, 10 faces; 1/5 with
  corridors, 0/5 without), gen-m-3 (4/5 with, 0/5 without), gen-m-7 (without corridors only, 1/5).
  Committed bench: M-3 needs corridors (`knownFailures` in `bench/run.ts`). Ask before any engine
  change.
- L/T shapes cost layout time (2–4× with corridors) and some M-3 margin; ~⅔ of placed rooms are L
  or T (no weight per family). Plus shapes off; their ids are not canonical.
- `roomsCanTouch` true (Edgar's default): rooms without a door may touch. Try false for cleaner
  maps if the bench allows it.
- Generator solvability assumes the player can walk back; a key behind a one-way edge with no
  return would pass. Not seen.
- Viewer export name does not say whether corridors were on.
- Render (catalogue, applies to Dyson too): key column width estimated from character counts; gate
  tags and chevrons can touch on short walls with several doors; 4+ glyphs spill out of a 3-unit
  room.
