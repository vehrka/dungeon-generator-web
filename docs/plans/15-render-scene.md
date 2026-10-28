# Step 15: render scene

Branch `feature/render-scene` off `dev`. Dyson style step 1 in `STATUS.md`; design:
`docs/dyson-style.md` (code structure).

## Goal

Split the style-free geometry out of `render/svg.ts` into `render/scene.ts`; the catalogue painter
reads the scene. Output byte-identical. Prerequisite for the Dyson painter (step 2).

## Change

- `render/scene.ts`: `scene(graph, layout) → Scene`, grid units, no px, pure data.

  ```ts
  type SceneRoom = { id: RoomId; number: number; outline: Polygon; anchor: Point; glyphs: string[] };
  type SceneDoor = {
    segment: Segment; // the door, at room a's end of a corridor
    gates: Gate[]; // non-secret gates of the group
    tag?: string; // A, B, … when gates is not empty
    secret: boolean; // every door of the group secret
    oneway?: 1 | -1; // side of room a, only when every door is one-way a → b
    corridor?: { segment: Segment; sideA: 1 | -1; sideB: 1 | -1 };
  };
  type Scene = { rooms: SceneRoom[]; corridors: Polygon[]; doors: SceneDoor[]; bbox: Rect; anySecret: boolean; anyOneway: boolean };
  ```

  Moved from `svg.ts`: outlines, `corridorKey` and corridor dedup, `side`, the largest-rectangle
  anchor, `roomGlyphs`, door grouping, `letter`, the gate list.
- `anySecret` / `anyOneway` come from the raw `layout.doors`, not the groups: the legend uses
  `layout.doors.some(…)` while the marks need every door of a group. Kept as is to stay
  byte-identical; recorded in the STATUS open points.
- `render/svg.ts`: `render` = `scene()` + paint (px transform, polygons, number offsets, glyph row,
  `doorMark`, key column, title). The key column stays inline; it moves out in step 2, when the
  Dyson painter is its second caller. `draw`, `RenderMeta` and the exports unchanged, so CLI and
  worker are untouched.
- The painter computes `px(anchor)` from the same grid midpoint as today, or trailing digits shift.

## Tests first

- `tests/scene.test.ts`, on the fixture and hand-made layouts: one room per placement, outline
  translated; one corridor per distinct corridor key; door groups (count, tags A…, 3 lock and 1
  state on the fixture, secret only when all secret, one-way only when all a → b); `side` on an L
  (the bounding-box centre trap); anchor in the longest arm of a lying L; corridor `sideA` /
  `sideB`; deterministic.
- `tests/render.test.ts` and its snapshot: no edits.

## Byte-identical guard

The snapshot covers one fixture. Before the refactor, catalogue SVGs dumped from `dev` (throwaway
script, not committed): `bench/dungeons/*` and generated M/L zelda and cyber dungeons × layout seeds
1–3 × corridors on and off, 240 files. After: dump again, `diff -r` must be empty.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean; dump diff empty.
- No engine change, so no bench.
- `STATUS.md` step 1 ticked and the legend open point added; `docs/dyson-style.md` code structure
  updated if `Scene` differs from its list.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.
