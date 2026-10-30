# Step 20: neon design and mock-up

Branch `feature/neon-design` off `dev`. Neon style step 1 in `STATUS.md`; design:
`docs/neon-style.md`.

## Goal

`docs/neon-style.md` complete (tokens, role colours, type) and a mock-up SVG checked against the
reference image, so the core step has nothing left to decide. Docs and a throwaway mock-up only;
no change under `src/`, so no tests or bench.

## Change

- Role table fixed to schema 2. The draft's "item or key: room has objects" replaced by the room
  type: pickup rooms carry their own types (`key`, `bosskey`, `item`, `switch`, `lever`) as well
  as the object ids, and one rule from one field is simpler. Treasure types
  are `gb: <reward>` (with a space), matched by prefix. Unlisted types placed: `exit` with start,
  `n`, `p`, `c`, `e`, `t` as other. Gate nodes (`kind: gate`) are not rooms, no role.
- Mock-up on a generated cyber M, dungeon seed 1, layout seed 1 (`ref/neon/m-1-cyber.json`),
  not bench m-1: m-1 is classic, and neon draws cyber glyphs and labels.
- Mock-up made from real geometry with no engine code: `ref/neon/mock.py` restyles the CLI's
  catalogue SVG (CSS swap, page colour, role class per room from its number, glow copies of each
  room outline). Output `ref/neon/m-1-cyber-neon.svg`, PNG by resvg (the CLI's renderer) and
  compared with the reference by hand.
- Tokens recorded in `docs/neon-style.md` § Tokens: page, corridor, per role fill/wall/glow,
  glow widths and opacities, ink, muted, gate colour; number contrast ≥ 4.5:1 on every fill.
- Type: monospace stack without a web font, checked in resvg.
- Size estimate for l-1 from outline counts; the measure stays in the core step.
- Open points settled or kept in the doc.

## Done when

- `docs/neon-style.md` has no draft placeholders.
- Mock-up SVG, PNG and script committed under `ref/neon/`.
- `STATUS.md` neon step 1 ticked.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.

## Outcome

Mock-up `ref/neon/m-1-cyber-neon.svg` / `.png` (resvg 2.6.2, `ref/neon/png.ts`) from
`ref/neon/mock.py` over the CLI's catalogue SVG of `ref/neon/m-1-cyber.json`. Two rounds:

1. Draft palette (boss dimmer magenta, pickups coral, glow 2 copies at 12/6 px): boss rooms 5 and
   11 read as goals beside 14; glow too faint against the reference.
2. Boss red, pickups amber, goal fill share 0.40, wall 2 px, glow 3 copies 16/9/4 px. Roles read
   at a glance; numbers ≥ 8.7:1 on every fill.

SVG 17.9 → 23.1 kB on 16 rooms (glow +4.4 kB, CSS and classes +0.8 kB). Decided on the way: catalogue keeps no
default theme once cyber is neon; a role legend in the core step.

Review, fixed: pickup rooms do carry `objects` (the role still reads the type, rationale
corrected); the shared-wall glow claim was wrong (all glows go under all fills, so a seam shows
neither glow), now an open point with a clip fix; `exit` → start in the plan as in the doc; glow
size +4.4 kB not +1.5, l-1 estimate ~40 kB; `docs/design.md` §7 says catalogue loses its default;
stale "type and objects" and "2–3 copies"; `mock.py` checks every room matched and has a main
guard. Not fixed: `png.ts` repeats the CLI's resvg options, since the CLI renders from a JSON and
the mock needs an SVG file; it is a throwaway beside the mock.
