# Step 17: Dyson doors and gates

Branch `feature/dyson-doors` off `dev`. Dyson style step 3 in `STATUS.md`; design:
`docs/dyson-style.md` (doors and gates).

## Goal

Door and gate symbols in the Dyson style: door rectangle, archway at corridor ends, secret S, locked
bar, portcullis dots, boxed gate tags beside the door, black one-way chevron, legend. The geometry
goes in `scene.ts`, so the neon painter reuses it. No engine change, so no bench.

## Change

- `render/scene.ts`, `SceneDoor` gains, in grid units (catalogue ignores them, output unchanged):
  - `symbol: "door" | "lock" | "portcullis" | "secret"`: secret first; else any `lock` gate → lock;
    else any other gate (state, on, off, or an unknown kind from the JSON) → portcullis; else door.
    A group with lock and state draws as lock; the key column still lists both kinds.
  - `tagAt?: Point`: door midpoint 0.6 unit into room a (opposite `sideA`), when there is a tag.
  - `onewayAt?: Point`: door midpoint 0.6 unit to room b's side (into the corridor through one),
    when one-way. Tag and chevron on opposite sides, never on each other.
- The design's fallback (tag to b's side when a's side is outside a) is dropped: `side()` tests the
  grid cell next to the door, which is in a by definition, and 0.6 < 1, so the tag box (0.31–0.89
  unit in) is always inside a. A test pins it.
- Tag collisions: two doors either side of a corner (`cornerDistance 0`) put their tags 0.1 unit
  apart. Count overlapping tag pairs on the bench and generated maps first (throwaway script); only
  if any: push the later tag another 0.6 into a while it overlaps, staying inside a.
- `render/dyson.ts`, px:

  | symbol | room a end | corridor's room b end |
  |--------|------------|-----------------------|
  | door | white rectangle, length segment − wall (as today's gap, clears corners), 8 px across, 1.5 px outline | archway: today's gap |
  | lock | door rectangle + short bar across its middle, along the normal | archway |
  | portcullis | gap + 3 dots on the wall line | archway |
  | secret | S on the unbroken wall, as today | S, so the corridor does not give it away |

  A door rectangle covers its gap: gaps only at archways and portcullis. Gate tag `tagMark` (boxed,
  serif) at `px(tagAt)`. Chevron black at `px(onewayAt)` through `chevron(…, tag = false)`;
  signature unchanged, so the catalogue stays. Legend lists only what is drawn: door, locked door,
  portcullis, secret door, one-way, gate.
- Defaults to tune by eye: bar along the normal, 3 dots, rectangle 8 px.

## Tests first

- `tests/scene.test.ts`: fixture symbols 3 lock, 1 portcullis, the rest door or secret; lock + state
  group → lock; `tagAt` inside room a and 0.6 from the midpoint; `onewayAt` on b's side; corridor:
  tag in room a, chevron in the corridor.
- `tests/render.test.ts`, Dyson: door rectangles, bars and dots counted by symbol; one archway gap per
  corridor b end and per portcullis; tag at `px(tagAt)`, off the door; chevron on b's side pointing
  a → b (adapt the existing test); legend entries only when drawn; Dyson snapshot updated on purpose,
  catalogue snapshot unchanged.

## Byte-identical guard

Catalogue SVGs dumped from `dev` before the change (throwaway script, as in steps 15–16): 240 files.
After: `diff -r` empty.

## By hand

PNGs of m-1, l-1 and a generated zelda L: door rectangles at L/T corners and on short walls, tags in
3-unit rooms against numbers and glyphs. l-1 render time and SVG size noted in
`docs/dyson-style.md`.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean; dump diff empty.
- `docs/dyson-style.md` doors section: fallback dropped, mixed-group rule, legend, measurements.
- `STATUS.md` step 3 ticked; open point on tags and chevrons touching updated.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.
