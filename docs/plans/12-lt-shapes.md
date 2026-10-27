# Step 12: L/T/plus shapes

Branch `feature/lt-shapes` off `dev`. STATUS step 12; design: `docs/design.md` §4 (shape pool) and
the geometry note ("Rotation comes with the L/T shapes"). Edgar: `Resources/Rooms/otherShapes.yml`,
`Utils/ConfigParsing/ConfigLoader.cs` (`GetTransformations`),
`ConfigurationSpaces/ConfigurationSpacesGenerator.cs:379` (one instance per distinct transform).

## Edgar

- Room templates are hand-made polygons. `otherShapes.yml`: L 6×6 with 3-wide arms, L 6×9, T 9×6
  with a 3-wide stem: arms about ⅓–½ of the box.
- A template allows rotations 0/90/180/270 by default; each becomes a `RoomTemplateInstance`,
  identical outlines merged. No mirroring.
- Door lines, configuration spaces, overlap and touch already take any orthogonal polygon here, so
  no change to `doors.ts`, `configSpace.ts`, `energy.ts`, `layout.ts`.

## Decisions (2026-10-27)

- **L and T on, plus off; `minNotch` 2** (user's call after the spike). One base per family and
  pool key, `minArm` 2.
- `minNotch` added during the spike: with 1-deep cut-outs many shapes read as a rectangle with a
  dent, plus shapes as blobs.

Spike, sum of ms/seed over the 15 bench dungeons (layout seeds 1–5), share of placed rooms that
are not rectangles; M-3 with corridors over layout seeds 1–20:

| variant                 | corridors        | no corridors      | not rect | M-3 /20 |
|-------------------------|------------------|-------------------|----------|---------|
| rectangles (step 11)    | pass, 1.8 s      | known, 3.7 s      | 0%       | 19      |
| L                       | pass, 3.5 s      | known, 3.6 s      | 51%      | 16      |
| L, T                    | pass, 3.4 s      | known, 4.2 s      | 68%      | 17      |
| L, T, plus              | M-3 4/5, 7.4 s   | known, 5.8 s      | 73%      |         |
| L, T, plus, minArm 3    | M-3 3/5, 8.8 s   | M-5 4/5, 8.0 s    | 73%      |         |
| 2 × (L, T, plus)        | M-3 4/5, 12.6 s  | known, 9.3 s      | 86%      |         |
| L, minNotch 2           | M-3 4/5, 3.6 s   | known, 3.4 s      | 49%      | 17      |
| **L, T, minNotch 2**    | pass, 4.5 s      | known, 4.2 s      | 65%      | 15      |
| L, T, plus, minNotch 2  | M-3 4/5, 7.5 s   | known, 5.2 s      | 70%      |         |

"known": only M-3 fails, the bench's known failure without corridors. M-3 is marginal in every
variant with corridors (5 seeds are noisy); plus costs the most.

## Change

- `geometry.ts`: `rotate(poly, quarterTurns)`, clockwise on screen, moved back so its bounding box
  starts at 0,0, through `polygon()`.
- `shapes.ts`: three families next to the rectangles, each from its own stream per pool key
  (`l/<type>`, `t/<type>`, `plus/<type>`, `l+<extra>/<type>` for hubs), so the rectangles of a seed
  stay as on `dev`.
  - Bounding box w×h from `sizeRule`, like rectangles.
  - Arms at least `minArm` thick, every cut-out at least `minNotch` deep and wide; a family whose
    box cannot fit is skipped for that key.
  - L: vertical arm `a` wide, horizontal arm `b` high, corner top-left. T: bar `b` high across the
    top, stem `a` wide centred (floor: an odd margin leaves the extra cell right). Plus: both bars
    centred.
  - Each base shape adds its distinct rotations (L, T 4; plus 1 or 2). Id from the base and
    rotation, `l-6x5-3x2-r1`; equal outlines from different bases share the first id.
  - Bases drawn without repeats from the list of every (w, h, a, b) the rules allow (fewer when
    the list is shorter); no retry loop.
- `config.ts`: `minArm`, `minNotch`, and base shapes per pool key `lShapes`, `tShapes`,
  `plusShapes`. Ours: Edgar's templates are hand-made. Defaults from the spike.
- `render/svg.ts`: number and glyphs in the largest rectangle of both slab partitions (vertical and
  horizontal), so a lying L keeps them in its long arm.

Side effects: `avgSize`/σ change, so every dungeon gets other layouts for the same seed; perturb
picks a shape uniformly from the pool, so the share of non-rectangles grows with their instances.

## Spike (scratch script, both corridor modes)

Before the defaults: rectangles only (baseline), L only (1 base), one of each family, two of each;
`minArm` 2 and 3. Per run: pass/5, ms/seed. Main risk is pool size: ~4 shapes per key grow to
~13, configuration spaces with its square (lazy cache, but `overCorridor` is costly). Defaults: the
setting that keeps the bench at `0 failing` and ms/seed in range, with non-rectangles a visible
minority unless the user asks for more.

## Tests first

- geometry: `rotate` 4× is identity; keeps area; result starts top-left, clockwise, at 0,0;
  rotation of a rectangle swaps sides.
- shapes: rectangles unchanged for a seed; every L/T/plus is a valid polygon inside the size
  rule's box, arms ≥ `minArm`, the right vertex count (6, 8, 12), all distinct rotations, no
  duplicate ids or outlines; families skipped when the range is too small; deterministic; families
  off (0) gives today's pool.
- configSpace: an L against a rectangle, every offset free of overlap with a shared door,
  including offsets in the notch.
- layout: fixture and M-1 lay out with mixed pools.
- render: number in the long arm of a lying L; snapshot updated.

## Done when

- typecheck, tests, build clean.
- Bench both modes, before/after table in the commit: `0 failing, 0 known` with corridors,
  `0 failing, 1 known` without.
- `/code-review` before merge.
- `docs/design.md` §4 and geometry note, `STATUS.md` updated in the same commit.

## Out of scope

- Mirroring (Edgar rotates only), caves (step 13), a CLI/viewer switch for families, per-type
  family rules beyond the size skip.
