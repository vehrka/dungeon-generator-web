# Delve Generator: neon map style

A third map style for the cyber theme, after the Dyson style is done: a black page, rooms as neon
blocks with a glow, dark corridors between them like streets seen from above. Mood reference: an
AI-generated cyberpunk city texture
(https://pics.craiyon.com/2023-10-03/b1f155b993cd4201be657a2ba09ff80f.webp), used for palette and
feel only; it is not a map. Decided 2026-10-28; tokens, roles and type settled 2026-10-30 on the
mock-up (`ref/neon/`, `docs/plans/20-neon-design.md`).

This file is the source of truth for the neon style. `docs/design.md` covers the rest,
`docs/dyson-style.md` the Dyson style. Progress: `STATUS.md`.

## Decisions (2026-10-28)

- Third style `neon`, beside `catalogue` and `dyson`. The catalogue style stays as it is.
  `styleFor("cyber")` → `neon` once the style is ready; catalogue until then, and by `--style`
  after.
- Screen only: built for the viewer and VTT (FoundryVTT), not for print. A black page and
  saturated colour are fine. PNG export at Foundry's grid scale: not in scope, add later if needed.
- Glow from stacked strokes (2–3 wider copies of the outline at falling opacity), no SVG filters:
  cheaper to render, no differences between engines (resvg), plain SVG to test. Measure size on
  l-1 as for Dyson.
- Colour by room role: a pure function of the room, no randomness, simple snapshots. Read from
  fields already in schema 2; no schema change.

## Scope

- Render only, like Dyson: engine, layout, schema 2, GM key and bench do not change. Same JSON +
  layout seed gives the same layout in every style.
- In: neon painter (page, floors, corridors, walls, glow, role colours, type), doors and gate
  symbols, room detail, viewer select and export suffix.
- Out: copying the reference image; whole-page detail (it buries rooms, numbers and doors);
  diagonal blocks (the layout is grid-aligned); SVG filters; web fonts; new dependencies.

## Constraints

Same as `docs/dyson-style.md` § Constraints: `render` pure; randomness only through
`rng(layoutSeed, "render/neon/<name>")`; same input → byte-identical SVG; catalogue and Dyson
output unchanged by neon work (their snapshots guard it); plain SVG 1.1; every JSON value escaped;
style constants at the top of `render/neon.ts`, not in `LayoutConfig`.

## Code structure

- `render/neon.ts`: the `Painter` (CSS, page colour, `pad`, `paint`), next to `dyson.ts`.
  `MapStyle` gains `"neon"`, `painters` gains `neon`.
- Reuse `scene.ts` for everything geometric: outlines, corridors, door groups, door symbol
  geometry (Dyson step 3 puts it there, not in `dyson.ts`), number anchors, glyphs.
- Role per room: `scene.ts` or a small helper in `neon.ts`, from the room's type and objects.

## Design

### Paint order

1. Page indigo-black. Title and key column in light text.
2. Corridors: dark fill, a thin dim outline (streets between blocks).
3. Glow: each room outline stroked 3 times, widest and faintest first, in the room's colour, all
   rooms before any fill: the fill covers the inner half, so the glow shows outside only.
4. Room fills: the role colour mixed into the page, dark enough that numbers stay readable.
5. Room detail (own step): small panels, vents, stripes inside each room, seeded, kept away from
   the number anchor and glyphs.
6. Walls: thin bright outline in the role colour.
7. Doors and gate symbols.
8. Numbers and glyphs in light ink.

### Role colours

A pure function of the room node (`id`, `type`, `number`); no randomness. Gate nodes
(`kind: gate`) are not rooms and get none. Node `objects` is empty in generated and Python files
(objects point at rooms by `found_in`), so pickups are read from the room type, not from objects.
Colour marks the rooms that matter to the run; everything else recedes in three dim tones.

| role | from schema 2 | colour |
|------|---------------|--------|
| start | `id === start`, type `st` or `exit` | cyan |
| goal | `id === goal`, type `gl` | magenta, brightest fill |
| boss | type `eb`, `em` | red |
| pickup | type `key`, `bosskey`, `item`, `switch`, `lever` | amber |
| treasure | type starting `gb:` (`gb: bombs`) | violet |
| other | everything else (`n`, `p`, `c`, `e`, `t`, unknown) | teal, blue, steel by `number % 3` |

Changed from the draft on the mock-up: boss in a dimmer magenta read as a second goal (m-1 cyber
rooms 5, 11 against 14), so red; coral pickups sat too close to the red, so amber, kin to the gate
yellow (a pickup opens a gate). Enemies (`e`) and traps (`t`) stay "other": a colour each would
light up most of the map.

### Tokens

Constants at the top of `render/neon.ts`. Fill = role colour mixed into the page by the fill
share (`mix(page, colour, share)`); contrast is the number ink on that fill (WCAG, ≥ 4.5).

| token | value | note |
|-------|-------|------|
| page | `#0b0814` | the reference's indigo-black, darker |
| corridor fill | `#141a2a` | |
| corridor outline | `#2b3550` | 1 px |
| ink | `#eef2ff` | numbers, glyphs, jambs, key text |
| muted | `#7d86a8` | key numbers, meta line |
| rule | `#232a40` | key column rules |
| gate | `#ffd23f` | tag outline and letter, on the page colour |
| wall | 2 px | role colour |
| glow | 16 px @ 0.10, 9 px @ 0.22, 4 px @ 0.45 | stroke width @ opacity, role colour, miter joins |

| role | colour | fill share | fill | contrast |
|------|--------|------------|------|----------|
| start | `#19e3ff` | 0.30 | `#0f4a5a` | 8.7 |
| goal | `#ff2bd6` | 0.40 | `#6d1662` | 9.7 |
| boss | `#ff3b4f` | 0.30 | `#541726` | 12.3 |
| pickup | `#ffa53a` | 0.28 | `#4f341f` | 10.2 |
| treasure | `#a66bff` | 0.30 | `#3a265a` | 11.7 |
| other 0 | `#1fbfa5` | 0.18 | `#0f292e` | 13.6 |
| other 1 | `#3d7bff` | 0.18 | `#141d3e` | 14.7 |
| other 2 | `#5b8aa6` | 0.18 | `#191f2e` | 14.7 |

Shared walls: two rooms that touch both stroke the shared segment; the later room's colour wins.
Accepted on the mock-up (12 and 9, 6 and 13): the glow on both sides still shows both colours.

### Doors and gates

Same symbol set as Dyson (door, archway, secret, lock bar, portcullis, gate tag, one-way chevron),
geometry from `scene.ts`, drawn in neon: ink strokes, gaps in the corridor fill, gate tags as
gate-yellow outlined boxes with a yellow letter on the page colour. The mock-up only restyles the
catalogue's gaps and jambs; symbol sizes are the doors step's.

### Type

Monospace, no web font: `'DejaVu Sans Mono','Noto Sans Mono','Liberation Mono',Menlo,Consolas,
monospace` (resvg needs named fonts first, see Dyson § Type). Text 12 px, numbers 17 px bold,
title 18 px bold, tag letters 10 px bold. Checked in resvg 2.6.2 (DejaVu Sans Mono); the mono key
column is wider per character than the catalogue's 7.5 px estimate allows for 13 px text, so the
painter sets 12 px.

### Legend

Gate, corridor, secret and one-way as in Dyson, plus one swatch per role used on the map (start,
goal, boss, pickup, treasure), so the colours read without the key. Not in the mock-up.

## Testing

As Dyson: standalone SVG, one floor polygon per room and corridor, every number and label once and
escaped, door symbol counts on the fixture, snapshot, same input same string, no `<filter>`.
`styleFor("cyber")` → `neon` once switched. Catalogue and Dyson snapshots unchanged. By hand: CLI
PNG of m-1 and l-1 and a generated cyber L; time and SVG size of l-1 noted here (target < 100 ms,
< 1 MB).

## Steps

See `STATUS.md`. Order: design doc and mock-up (generated cyber M, `ref/neon/`) → core painter → doors and gates →
room detail → viewer. Each step its own branch off `dev`, test first, `/code-review` before merge.

## Open points

- Glow cost on L maps: 3 copies per room outline. l-1 has 28 rooms, catalogue SVG 31 kB; the mock
  adds ~1.5 kB on 16 rooms, so l-1 should land near 35 kB before room detail. Measure in the core
  step.
- Detail density vs room shapes and numbers: room detail step.
- Catalogue keeps no default theme once cyber moves to neon: reachable by `--style` and the
  viewer select only. Decided 2026-10-30.
