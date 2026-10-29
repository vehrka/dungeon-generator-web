# Step 18: Dyson wobble and shadow

Branch `feature/dyson-wobble` off `dev`. Dyson style step 4 in `STATUS.md`; design:
`docs/dyson-style.md` (wobble, paint order, tokens).

## Goal

Hand-inked look: point-hashed wobble on every floor outline (shared walls stay one line) and a grey
wall-shadow band on the rock side of every wall. Render only, no engine change, so no bench.

## Change

- `render/hatch.ts`: `wobble(outline, layoutSeed, amplitude = wobbleAmp) → Polygon`, grid units.
  - Subdivide every edge at a 0.25 unit step in absolute grid coordinates.
  - Move each new point perpendicular to its edge by a hash, signed in absolute axes (dy on a
    horizontal edge, dx on a vertical one), never along the outline's normal: two rooms walk a
    shared wall in opposite directions, a normal-signed offset would draw two lines.
  - Hash: first draw of ``rng(layoutSeed, `render/wobble/${4x},${4y}`)``, integer quarter-unit keys
    so no float formatting in the key.
  - Points on whole grid units stay put, not only corners. Deviation from the design: a room's
    corner can sit in the middle of a neighbour's edge (T-junction); fixing only own corners would
    leave a sliver there. Every corner is on whole units, so this covers corners too.
  - `wobbleAmp ≈ 0.8 px / 24` (unit). 0 gives the straight outline (off switch).
- `render/dyson.ts`:
  - The polygons in `<g id="floors">` are wobbled, so paper, grid, shadow and wall share every
    point through `<use>`.
  - Token `shadow` `#c8c8c8`, `.shadow{fill:none;stroke:shadow;stroke-width:≈0.6 unit}`.
  - Paint order: hatch → shadow `<use>` → paper → grid → wall → gaps → symbols → tags → numbers.
    Paper hides the shadow's inner half: a ≈ 0.3 unit band left outside the wall, over the hatching.
  - Doors, gaps and tags stay on the straight segment: gap half-width 2.5 px and door rectangle 4 px
    still cover a 1.5 px half-wall plus 0.8 px wobble.
- Tune by eye on PNGs of m-1 and l-1: wobble step (0.25) and amplitude, shadow width and colour.
  Record final values in the `docs/dyson-style.md` tokens table.

## Tests first

- `tests/hatch.test.ts`:
  - two touching rectangles: identical points on the shared edge;
  - T-junction (B's corner on A's edge): that point fixed in both, shared stretch identical;
  - corners and whole-unit points unmoved;
  - every offset ≤ amplitude and perpendicular to its edge;
  - amplitude 0 gives the input outline back;
  - same seed same points, other seed other points.
- `tests/render.test.ts`, Dyson: shadow `<use>` before paper; still one floor polygon per room and
  corridor; same input same string; Dyson snapshot updated on purpose, catalogue snapshot unchanged.

## Byte-identical guard

Catalogue SVGs dumped from `dev` before the change (throwaway script, as in steps 15–17). After:
`diff -r` empty.

## Measure

m-1, l-1, l-8 at layout seed 1, mean of 10 renders, against `dev` in the same session: time and SVG
size. More polygon points (×4 per unit of perimeter): expect +30–50 kB, still < 1 MB.

## Risk

Independent jitter every 0.25 unit may read as jittery, not hand-drawn. Then a 0.5 step or a
smaller amplitude; smooth value noise between whole-unit points only if both fail the eye test.

## Outcome

Step 0.25 read saw-toothed at 1×; 0.5 step at 0.8 px kept (`wobbleStep`), so hash keys are whole
half units, not quarters. Shadow `#c8c8c8`, 0.6 unit, unchanged. l-1 403 → 417 kB, 95 → 99 ms
(noise); catalogue dump of 172 maps byte-identical.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean; dump diff empty.
- `docs/dyson-style.md`: wobble section (whole-unit rule), tokens, measurements.
- `STATUS.md` step 4 ticked.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.
