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

- Third style `neon`, beside `plain` and `dyson`. The plain style stays as it is.
  `styleFor("cyber")` → `neon`, zelda → `dyson`, any other theme or none → `plain` (decided
  2026-10-30, in the core step). The viewer has no style select: its theme select picks the look
  (`docs/plans/22-one-theme-select.md`).
- Screen only: built for the viewer and VTT (FoundryVTT), not for print. A black page and
  saturated colour are fine. PNG export at Foundry's grid scale: not in scope, add later if needed.
- Glow from stacked strokes (3 wider copies of the outline at falling opacity), no SVG filters:
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
`rng(layoutSeed, "render/neon/<name>")`; same input → byte-identical SVG; plain and Dyson
output unchanged by neon work (their snapshots guard it); plain SVG 1.1; every JSON value escaped;
style constants at the top of `render/neon.ts`, not in `LayoutConfig`.

## Code structure

- `render/neon.ts`: the `Painter` (CSS, page colour, `pad`, `paint`), next to `dyson.ts`.
  `MapStyle` gains `"neon"`, `painters` gains `neon`.
- Reuse `scene.ts` for everything geometric: outlines, corridors, door groups, door symbol
  geometry (Dyson step 3 puts it there, not in `dyson.ts`), number anchors, glyphs.
- Role per room: `scene.ts` or a small helper in `neon.ts`, from the room's type (§ Role colours).

## Design

### Paint order

1. Page indigo-black. Title and key column in light text.
2. Glow: each room outline stroked 3 times, widest and faintest first, in the room's colour, all
   rooms before any fill: the fill covers the inner half, so the glow shows outside only.
3. Corridors: dark fill, a thin dim outline (streets between blocks). Over the glows, so no glow
   band crosses a doorway (core step review).
4. Room fills: the role colour mixed into the page, dark enough that numbers stay readable.
5. Room detail (own step): small panels, vents, stripes inside each room, seeded, kept away from
   the number anchor and glyphs.
6. Walls: thin bright outline in the role colour.
7. Doors and gate symbols.
8. Numbers and glyphs in light ink.

### Role colours

A pure function of the room node (`id`, `type`, `number`); no randomness. Gate nodes
(`kind: gate`) are not rooms and get none. Pickups are read from the room type, not from node
`objects`: pickup rooms carry both (m-1 cyber room 8 `item` holds `item-1`), but the type also
covers a `switch` or `lever`, and one rule from one field keeps the role a function of the type.
`exit` (an extra entrance) counts as start.
Colour marks the rooms that matter to the run; everything else recedes in three dim tones.

| role | from schema 2 | colour |
|------|---------------|--------|
| start | `id === start`, type `st` or `exit` | cyan |
| goal | `id === goal`, type `gl` | magenta, brightest fill |
| boss | type `eb`, `em` | red |
| pickup | type `key`, `bosskey`, `item`, `switch`, `lever` | amber |
| treasure | type `gb` or `gb: <reward>`, as the layout's `shapeRules` reads it | violet |
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

Shared walls: two rooms that touch both stroke the shared segment; the later room's colour wins,
and neither glow shows there, since each room's fill covers the other's outer glow (all glows go
under all fills). On the mock-up (12 and 9, 6 and 13) the seam reads as one wall in one colour;
accepted for now, open point.

### Doors and gates

Same symbol set as Dyson (door, archway, secret, lock bar, portcullis, gate tag, one-way chevron),
geometry and tag/chevron positions from `scene.ts`, symbols from `marks.ts` (shared with Dyson, wall
width an argument), drawn in neon over the 2 px wall:

| symbol | room a end | corridor's room b end |
|--------|------------|-----------------------|
| door | rectangle, page fill, ink 1.5 px outline, 8 px across, segment − wall long | archway |
| lock | door rectangle + ink bar along the normal, 12 px | archway |
| portcullis | gap + 3 ink dots (r 1.5 px) on the wall line | archway |
| secret | ink S, 13 px bold, page-colour halo, on the unbroken wall | S |

Gap (archway, portcullis): the corridor fill, a pixel wider than the wall each side, so a
room-to-room portcullis is a dark doorway between two fills. Gate tags as gate-yellow outlined boxes
with a yellow letter on the page colour, beside the door in room a; one-way chevrons ink, on room
b's side. Paint order: glows, corridors, fills, walls, gaps, symbols, tags and chevrons, numbers
and glyphs. Tuned by eye (l-1, m-1, generated cyber M 1 and L 2): Dyson's 8 px rectangle reads
well against the 2 px wall, page fill keeps it a hole in the glow; bar and dots in ink, the tag
alone carries the gate yellow.

### Type

Monospace, no web font: `'DejaVu Sans Mono','Noto Sans Mono','Liberation Mono',Menlo,Consolas,
monospace` (resvg needs named fonts first, see Dyson § Type). Text 12 px, numbers 17 px bold,
title 18 px bold, tag letters 10 px bold. Checked in resvg 2.6.2 (DejaVu Sans Mono); the mono key
column is wider per character than the plain style's 7.5 px estimate allows for 13 px text, so the
painter sets 12 px.

### Legend

One swatch per role used on the map (start, goal, boss, pickup, treasure), so the colours read
without the key, then corridor, then Dyson's door entries, each only when drawn: door, locked
door, portcullis, secret door, one-way, gate. Not in the mock-up.

## Testing

As Dyson: standalone SVG, one floor polygon per room and corridor, every number and label once and
escaped, door symbol counts on the fixture, snapshot, same input same string, no `<filter>`.
`styleFor("cyber")` → `neon`. Plain and Dyson snapshots unchanged. By hand: CLI
PNG of m-1 and l-1 and a generated cyber L; time and SVG size of l-1 noted here (target < 100 ms,
< 1 MB).

## Measurements

Core step, l-1, layout seed 1, render only (layout excluded), mean of 20: plain 0.8 ms, 31.0 kB;
neon 0.9 ms, 38.8 kB (Dyson 102 ms, 421 kB). Each outline once in `<defs>`, its five passes
(3 glows, fill, wall) as `<use>`. Doors step: neon 0.7–0.9 ms, 29.0 kB (the plain gaps' `<g>`
groups with jambs gone).

## Steps

See `STATUS.md`. Order: design doc and mock-up (generated cyber M, `ref/neon/`) → core painter → doors and gates →
room detail → viewer. Each step its own branch off `dev`, test first, `/code-review` before merge.

## Open points

- Shared walls lose the glow and show one room's colour (§ Tokens). If it reads badly on L maps:
  stroke each room's wall clipped to its own inside, so a shared seam shows both colours.
- Detail density vs room shapes and numbers: room detail step.
