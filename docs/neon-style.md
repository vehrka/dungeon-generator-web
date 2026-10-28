# Delve Generator: neon map style

A third map style for the cyber theme, after the Dyson style is done: a black page, rooms as neon
blocks with a glow, dark corridors between them like streets seen from above. Mood reference: an
AI-generated cyberpunk city texture
(https://pics.craiyon.com/2023-10-03/b1f155b993cd4201be657a2ba09ff80f.webp), used for palette and
feel only; it is not a map. Decided 2026-10-28; this design is a first draft, to be completed
before the core step.

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

## Design (draft)

### Paint order

1. Page near-black. Title and key column in light text.
2. Corridors: dark fill, a thin dim outline (streets between blocks).
3. Glow: each room outline stroked 2–3 times, widest and faintest first, in the room's colour.
4. Room fills: the role colour, dark enough that numbers stay readable.
5. Room detail (own step): small panels, vents, stripes inside each room, seeded, kept away from
   the number anchor and glyphs.
6. Walls: thin bright outline in the role colour.
7. Doors and gate symbols.
8. Numbers and glyphs in light ink.

### Role colours

| role | from schema 2 | colour |
|------|---------------|--------|
| start | `id === start` (type `st`) | cyan |
| goal | `id === goal` (type `gl`) | magenta |
| boss, mini-boss | type `eb`, `em` | magenta, dimmer |
| item or key | room has objects | coral |
| treasure | type `gb:*` | violet |
| other | everything else | 2–3 dim teal/blue tones, cycled by room number |

Exact values, fill vs wall vs glow tints, and contrast for numbers: tuned on the mock-up, recorded
here as tokens.

### Doors and gates

Same symbol set as Dyson (door, archway, secret, lock bar, portcullis, gate tag, one-way chevron),
drawn in neon: bright strokes on the dark page, tags as outlined boxes. Details after Dyson step 3
fixes the shared geometry.

### Type

Monospace or condensed sans stack, no web font (resvg needs named fonts first, see Dyson § Type).
Choose on the mock-up.

## Testing

As Dyson: standalone SVG, one floor polygon per room and corridor, every number and label once and
escaped, door symbol counts on the fixture, snapshot, same input same string, no `<filter>`.
`styleFor("cyber")` → `neon` once switched. Catalogue and Dyson snapshots unchanged. By hand: CLI
PNG of m-1 and l-1 and a generated cyber L; time and SVG size of l-1 noted here (target < 100 ms,
< 1 MB).

## Steps

See `STATUS.md`. Order: design doc and hand-made m-1 mock-up → core painter → doors and gates →
room detail → viewer. Each step its own branch off `dev`, test first, `/code-review` before merge.

## Open points

- Glow cost on L maps: stacked strokes multiply outline count by 3–4; measure in the core step.
- Readability: role fills vs number contrast; detail density vs room shapes. Settle on the mock-up.
- Whether `catalogue` keeps any default theme once cyber moves to neon (only `--style` then).
