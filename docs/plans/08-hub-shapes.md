# Step 8: shape sizes from door count

Branch `feature/hub-shapes` off `dev`. STATUS step 8; design: `docs/design.md` §4 and open point
"door capacity".

## Problem

Shapes depend on room type only. A hub with 7 doors on a 4–7 room runs out of wall once its
neighbours crowd it. Bench (2026-10-27): M-1 fails 2/5 layout seeds, stuck on tree chain
`[12,11,10,19,18,25,23,24]` after the chain holding hub #3 (7 doors).

Degree (distinct neighbours) over the 15 bench dungeons `normalize` accepts:

| degree | 1   | 2   | 3  | 4  | 5 | 6 | 7 |
|--------|-----|-----|----|----|---|---|---|
| rooms  | 119 | 110 | 64 | 22 | 3 | 1 | 2 |

Every room of degree ≥ 5 is type `n` (4–7): L-1 (6), L-3, M-4, M-7 (5), M-1 and M-3 (7).

## Spike (2026-10-27, scratch script, layout seeds 1–5)

| run                                  | M-1 | M-3 |
|--------------------------------------|-----|-----|
| defaults                             | 3/5 | 0/5 |
| degree ≥ 5 → 7–10 (`gl` shapes)      | 5/5 | 0/5 |
| plus degree 4 → 4–6 (`st` shapes)    | 5/5 | 0/5 |

All-`n` star (hub + 7 leaves) and wheel (hub + 7-room rim) already lay out 5/5 today: a hub alone
is not the problem, a hub in a crowded layout is. The spike used the `gl` streams, not the planned
`rect/n+3` ones; it shows the size works, not that the planned shapes do.

M-3 is a different problem: it stays stuck on tree chain `[26,25,19,17,27,20,31,34]`, which does
not hold hub #3. Step 8b.

## Change

- Size rule from type and degree: above `hubDegree` (4) doors, both bounds grow by `hubGrowth`
  (1) per extra door. `n` with 7 doors → 7–10, as in the spike. Growing degree-4 rooms adds
  nothing (spike row 3).
- Pool key is `{ type, extra }`, id `<extra>/<type>` (types are free text, so no parsed suffix;
  changed after review). Stream `rect/<type>` for extra 0, `rect+<extra>/<type>` otherwise, so
  rooms of degree ≤ 4 keep their current shapes for every seed.
- `shapePool` takes the keys (type + degree from the graph); `layout` looks a room up by its key,
  not `room.type`. Helper `poolKey(room, degree, config)` in `shapes.ts`, used by both and by
  `bench/run.ts` / `tests/layout.test.ts`.
- `hubDegree`, `hubGrowth` in `LayoutConfig`. Not from Edgar (Edgar uses hand-made templates);
  comment says so.
- Side effect: bigger hub shapes raise `avgSize`, so σ and the difference scale change. Dungeons
  with a degree-≥5 room get different layouts for the same seed; bench timings will move.
- Known limit: the rule reads only the door count, not neighbour sizes (7 `key` neighbours need
  less wall than 7 `n`). Fine while every bench hub is `n`.

## Tests first

- `shapeRules`: degree ≤ 4 → type rule unchanged; degree 7 on `n` → 7–10; `gb: <reward>` still
  maps to `gb`.
- `shapes`: degree-≤4 pool equals today's pool for the same seed; hub key gets its own shapes, all
  sides ≥ the grown minimum; deterministic.
- `layout`: M-1 as a fixture (`tests/fixtures/m-1.json`, copy of the bench file) over its failing
  layout seeds; red today, green after. Fixture `ruin.json` still lays out.

## Done when

- `npm run typecheck`, `npm test` clean.
- `npm run bench`: M-1 5/5, no other dungeon worse, ms/seed in the same range. Before/after table
  in the commit body. M-3 still fails (step 8b), so the bench still exits 1.
- `docs/design.md` §4 (size rule, pool key, streams), open point "door capacity" and `STATUS.md`
  updated in the same commit.

## Out of scope

- Doors per wall or per-room `cornerDistance`.
- M-3 (step 8b: tree chain boxed in by placed rooms).
