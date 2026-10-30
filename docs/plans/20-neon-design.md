# Step 20: neon design and mock-up

Branch `feature/neon-design` off `dev`. Neon style step 1 in `STATUS.md`; design:
`docs/neon-style.md`.

## Goal

`docs/neon-style.md` complete (tokens, role colours, type) and a mock-up SVG checked against the
reference image, so the core step has nothing left to decide. Docs and a throwaway mock-up only;
no change under `src/`, so no tests or bench.

## Change

- Role table fixed to schema 2. The draft's "item or key: room has objects" does not hold: node
  `objects` is empty in generated and Python files; objects point at rooms by `found_in`, and the
  pickup rooms carry their own types (`key`, `bosskey`, `item`, `switch`, `lever`). Treasure types
  are `gb: <reward>` (with a space), matched by prefix. Unlisted types (`n`, `p`, `c`, `e`, `t`,
  `exit`) placed. Gate nodes (`kind: gate`) are not rooms, no role.
- Mock-up on a generated cyber M, dungeon seed 1, layout seed 1 (`ref/neon/m-1-cyber.json`),
  not bench m-1: m-1 is zelda, and neon draws cyber glyphs and labels.
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

SVG 18 → 23 kB on 16 rooms (glow +1.5 kB, the rest CSS). Decided on the way: catalogue keeps no
default theme once cyber is neon; a role legend in the core step.
