# Step 8: shape sizes from door count

Branch `feature/hub-shapes` off `dev`. STATUS step 8; design: `docs/design.md` §4 and open point
"door capacity".

## Problem

Shapes depend on room type only. A hub with 7 neighbours on a 4×4 room has no room around its
walls for 7 rooms of side ≥ 3, so its chain fails. Bench (2026-10-27): M-1 fails 2/5 layout seeds,
M-3 fails 5/5.

Degree (distinct neighbours) over the 15 bench dungeons `normalize` accepts:

| degree | 1   | 2   | 3  | 4  | 5 | 6 | 7 |
|--------|-----|-----|----|----|---|---|---|
| rooms  | 119 | 110 | 64 | 22 | 3 | 1 | 2 |

Every room of degree ≥ 5 is type `n` (4–7): L-1 (6), L-3, M-4, M-7 (5), M-1 and M-3 (7).

## Change

- Size rule from type and degree: above `hubDegree` (4) doors, both bounds grow by
  `hubGrowth` (1) per extra door. `n` with 7 doors → 7–10.
- Pool key is `(type, extra)`, e.g. `n` and `n+3`; extra 0 keeps today's key. Stream
  `rect/<type>` for extra 0, `rect/<type>+<extra>` otherwise, so rooms of degree ≤ 4 keep their
  current shapes for every seed.
- `shapePool` takes the keys (type + degree from the graph); `layout` looks a room up by its key,
  not `room.type`. Helper `poolKey(room, degree, config)` in `shapes.ts`, used by both and by
  `bench/run.ts` / `tests/layout.test.ts`.
- `hubDegree`, `hubGrowth` in `LayoutConfig`. Not from Edgar (Edgar uses hand-made templates);
  comment says so.

## Tests first

- `shapeRules`: degree ≤ 4 → type rule unchanged; degree 7 on `n` → 7–10; `gb: <reward>` still
  maps to `gb`.
- `shapes`: degree-≤4 pool equals today's pool for the same seed; hub key gets its own shapes, all
  sides ≥ the grown minimum; deterministic.
- `layout`: fixture still lays out; a star (1 hub, 7 leaves) lays out for seeds 1–5.

## Done when

- `npm run typecheck`, `npm test` clean.
- `npm run bench` passes all 15, before/after table in the commit body.
- If M-3 still fails: hub sizing is not enough (short cycle chains, see open point). Record numbers,
  stop, ask; don't tune `hubGrowth` past 2 without checking with the user.
- `docs/design.md` §4 (size rule, pool key, streams), open point "door capacity" and `STATUS.md`
  updated in the same commit.

## Out of scope

- Doors per wall or per-room `cornerDistance`.
- Short-cycle-chain fixes for M-3 (own step if needed).
