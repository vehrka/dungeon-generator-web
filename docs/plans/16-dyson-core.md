# Step 16: Dyson core

Branch `feature/dyson-core` off `dev`. Dyson style step 2 in `STATUS.md`; design:
`docs/dyson-style.md`.

## Goal

A second painter: white page, floors, floor grid, thick walls, rock hatching, serif numbers and
key column. Doors as plain gaps (symbols in step 3). Style chosen by theme or `--style`. No engine,
layout or schema change, so no bench.

## Change

- `render/svg.ts`: `type MapStyle = "catalogue" | "dyson"`; `RenderMeta.style?`, catalogue when
  absent, so existing `render` calls and the snapshot stay. `styleFor(theme)`: `cyber` →
  catalogue, anything else or none → dyson. `draw(json, layoutSeed, config, style =
  styleFor(json.theme))`. Key column and title move out of `render` into a shared frame taking the
  style's CSS, page colour and legend marks; catalogue output unchanged.
- `render/hatch.ts`, pure, grid units:
  - `floorCells(polygons)`: unit cells of the floors via `partition`.
  - `distance(p, cells)`: to the nearest floor cell, searched within `hatchDepth` only.
  - `poisson(domain, radius, rng)`: Bridson over rock cells within ⌈hatchDepth⌉ of a floor, not the
    whole bbox (≈ 1k cells vs ≈ 3.2k on an L map).
  - `hatch(floors, layoutSeed) → Segment[]`, stream `render/hatch`: keep 0 < d ≤ 1.5, past 0.6 ×
    depth with probability falling linearly to 0; cluster of 2–4 strokes, spacing 0.12, length
    0.45 ± 20%, uniform angle. Constants at the top.
- `render/dyson.ts`: paint order 1, 2, 4, 5, 6, 8 of the design (shadow and wobble in step 4). One
  `<path class="hatch">`, coordinates at 0.1 px; `<polygon class="floor">` for rooms and corridors;
  grid `<pattern>` 24 px, `userSpaceOnUse`, origin on the grid; walls 3 px, miter; doors a white
  rectangle cutting the wall at each door segment and corridor end; serif numbers 17 px; glyphs
  black 1.2 px. Tokens ink, paper, grid; font stack from the design.
- CLI `--style catalogue|dyson`; unknown value → error listing the options. Output name unchanged.
- Viewer: no code change. The worker calls `draw` without a style, so zelda maps turn Dyson now;
  the style select is step 5.
- Legend open point: `anySecret` / `anyOneway` from the door groups, for both styles, so the legend
  lists only marks drawn. Own commit after the byte-identical check; the catalogue snapshot may
  change on mixed groups, on purpose.

## Tests first

- `tests/hatch.test.ts`: no sample in a floor or past depth; same seed same strokes, other seed
  other strokes.
- `tests/render.test.ts`, Dyson: standalone SVG, white page; one floor polygon per room and
  corridor; numbers and labels once, escaped (hostile input); no amber, no `#e5e5e5`; same input
  same string; fixture snapshot. `styleFor`: cyber, zelda, other, undefined.
- CLI: `--style dyson` writes SVG and PNG; default follows the theme; bad style exits 1.
- Existing tests the default breaks (fixture theme `tor-barrow` → dyson): `draw` vs `render`
  passes `"catalogue"`; CLI corridor test adds `--style catalogue`.

## Byte-identical guard

Catalogue SVGs dumped from `dev` before the change (throwaway script, as in step 15): 240 files.
After the frame split: `diff -r` empty. The legend commit is checked separately.

## By hand

PNGs of m-1, l-1 and a generated zelda L. l-1 render time and SVG size noted in
`docs/dyson-style.md` (target < 100 ms, < 1 MB). Key column width estimate checked for the serif.

## Risk

Bridson too slow on L maps → jittered grid, one sample per 0.3-unit cell.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean; dump diff empty.
- `STATUS.md` step 2 ticked, legend open point resolved; `docs/dyson-style.md` measurements.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.
