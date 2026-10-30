# Status

**updated:** 2026-10-30

Generator, layout, catalogue render, CLI and viewer done (`docs/design.md`; history in git and
`docs/plans/`). Current work: a second map style, after Dyson Logos, design in
[docs/dyson-style.md](docs/dyson-style.md). Next: a third style, neon, for the cyber theme, design
in [docs/neon-style.md](docs/neon-style.md).

## Steps: Dyson map style

One feature branch per step, off `dev`, test first, `/code-review` before merging into `dev`.

- [x] 1. **scene refactor** (`feature/render-scene`): style-free geometry in `render/scene.ts`
  (outlines, corridors, door groups, gate letters, number anchors, glyphs), catalogue painter reads
  it. Catalogue snapshot byte-identical, render tests unchanged. Done: 240 bench and generated
  maps byte-identical (`docs/plans/15-render-scene.md`).
- [x] 2. **Dyson core** (`feature/dyson-core`): `MapStyle`, `styleFor(theme)` (cyber →
  catalogue, else Dyson), `render`/`draw` style argument, CLI `--style`; white page, floors
  (rooms and corridors alike), floor grid pattern, thick walls, hatching (`render/hatch.ts`),
  serif numbers, black glyphs, key column and title in the serif. Doors as plain gaps for now.
  Done: l-1 78–102 ms (noisy), 390 kB; gate tags, S and chevrons on the doors meanwhile; catalogue dump byte-identical (`docs/plans/16-dyson-core.md`). The
  viewer draws Dyson for non-cyber themes already, with no style select until step 5.
- [x] 3. **doors and gates** (`feature/dyson-doors`): door rectangle, archway at corridor ends,
  secret S, locked bar, portcullis dots, boxed gate tags beside the door in room a, black one-way
  chevron on room b's side, legend. Symbol and tag/chevron positions in `scene.ts`, so the neon
  painter reuses them. Done: corner tag overlaps pushed apart (4 → 0 on 286 maps), l-1 Dyson
  +2 kB, no measurable time, catalogue dump byte-identical (`docs/plans/17-dyson-doors.md`).
- [x] 4. **wobble and shadow** (`feature/dyson-wobble`): point-hashed wobble on all floor outlines
  (shared walls stay one line, whole-unit points fixed), grey wall shadow. Done: 0.8 px every
  0.5 unit (0.25 read saw-toothed); l-1 +14 kB, time within noise; catalogue dump byte-identical
  (`docs/plans/18-dyson-wobble.md`). Shadow redone inside the rooms, light from 330°, `#999999`
  (`feature/dyson-inner-shadow`), replacing the band outside the walls.
- [x] 5. **viewer** (`feature/dyson-viewer`): style select preset from the theme, export name
  `-dyson` suffix. Done: a hand-picked style stays until the theme changes; a style change reuses
  the worker's last layout; loading bar and a plain no-layout message (`docs/plans/19-dyson-viewer.md`).
- [ ] 6. *(later, ask first)* **dressing**: stairs in the start room, rubble, columns; not in the
  JSON, so drawn from the layout seed.

## Steps: neon map style (after Dyson)

Third style `neon` beside catalogue and Dyson, for the cyber theme, screen only (viewer, VTT).
Decided 2026-10-28: stacked-stroke glow, no SVG filters; colour by room role from schema 2.
Design in [docs/neon-style.md](docs/neon-style.md).

- [x] 1. **design and mock-up** (`feature/neon-design`): `docs/neon-style.md` complete (tokens,
  role colours, type, legend). Done: mock-up on generated cyber M seed 1 (`ref/neon/`, a script
  restyling the catalogue SVG); boss red and pickups amber, not the draft's dim magenta and coral;
  role from room type, not objects; catalogue loses its default theme (`docs/plans/20-neon-design.md`).
- [ ] 2. **neon core** (`feature/neon-core`): `MapStyle` `neon`, `render/neon.ts`, black page,
  dark corridors, role fills, stacked-stroke glow, walls, type, `--style neon`;
  `styleFor("cyber")` → neon. Measure time and size on l-1.
- [ ] 3. **doors and gates**: Dyson's symbol set from `scene.ts`, in neon.
- [ ] 4. **room detail**: panels, vents, stripes inside rooms, `rng(layoutSeed, "render/neon/…")`,
  clear of numbers and glyphs.
- [ ] 5. **viewer**: neon in the style select, export name `-neon` suffix.

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
- `normalize` does not check `theme` is a string: a loaded `"theme": 5` fails in the render with
  `s.replace is not a function` instead of a schema error.
- Render (catalogue, applies to Dyson too): key column width estimated from character counts; 4+
  glyphs spill out of a 3-unit room. Catalogue: gate tags and chevrons can touch on short walls with
  several doors. Dyson: tags beside the door, pushed apart from other tags unless the room is too
  shallow; not checked against other doors' chevrons (0 overlaps on 286 maps); a tag can touch the
  other door's rectangle at an L/T corner.
