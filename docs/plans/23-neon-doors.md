# Step 23: neon doors and gates

Branch `feature/neon-doors` off `dev`. Neon style step 3 in `STATUS.md`; design:
`docs/neon-style.md` § Doors and gates.

## Goal

Dyson's door symbol set in neon: door rectangle, archway at a corridor's room b end, secret S, lock
bar, portcullis dots, gate tag beside the door in room a (`tagAt`), one-way chevron on room b's side
(`onewayAt`), legend. Geometry from `scene.ts` as is; neon only paints it. Replaces the interim
plain gaps and jambs (`doorMark`), and with them the core step's left-overs: the copied door loop
and legend, the dead `gap-corridor` rect, two tags crowding one corridor end (cyber L 2, E and F).
No engine, layout or schema change, so no bench.

## Change

- Refactor first, own commit (`refactor(render)`): `wallRect`, `barMark`, `dotMarks`, `secretMark`
  and `round` move from `dyson.ts` to `marks.ts`, unchanged but for the wall width, now an argument
  (`wallRect(s, px, h, cls, wall)`; Dyson passes 3). Dyson output byte-identical (dump guard).
- `render/neon.ts`, px, wall 2:

  | symbol | room a end | corridor's room b end |
  |--------|------------|-----------------------|
  | door | rectangle, page fill, ink 1.5 px outline, 8 px across, segment − wall long | archway: gap in the corridor fill |
  | lock | door rectangle + ink bar along the normal | archway |
  | portcullis | gap (corridor fill) + 3 ink dots on the wall line | archway |
  | secret | ink S on the unbroken wall, page-colour halo | S |

  - Gap: `wallRect(…, wall / 2 + 1, "gap")`, corridor fill, covering the 2 px wall. A room-to-room
    portcullis gets the corridor fill too: a dark doorway between two fills.
  - Tags: `tagMark` at `px(tagAt)` (gate yellow on the page, as now). Chevron: ink at
    `px(onewayAt)` through `chevron(…, tag = false)`. Tags and chevrons after all symbols (Dyson's
    order: a tag can reach a neighbour's rectangle at a corner).
  - Paint order: glows, corridors, fills, walls, gaps, symbols, tags and chevrons, numbers and glyphs.
  - Legend as Dyson, only what is drawn: door, locked door, portcullis, secret door, one-way, gate;
    after the role swatches and corridor. Secret shows the S (today a dash).
  - CSS: drop `.jamb`, `.dash`, `.gap-corridor`; add `.door`, `.bar`, `.dot`, `.secret`.
  - `doorMark` import goes; it stays in `marks.ts` for the plain painter.
- Defaults to tune by eye: rectangle 8 px (Dyson's; maybe 6 against a 2 px wall), page vs corridor
  fill in the rectangle, bar and dots in ink vs gate yellow (design says ink; yellow would tie the
  lock to its tag).

## Tests first

`tests/render.test.ts`, `describe("neon")`, fixture with `style: "neon"`:
- door rectangles, bars, dots and S counted by symbol (fixture: 3 lock, 1 portcullis, rest door or
  secret, as Dyson's test); one archway gap per non-secret corridor b end and per portcullis.
- tag at `px(tagAt)`, off the door segment; chevron at `px(onewayAt)` pointing a → b.
- no `class="jamb"`, `class="dash"`, `gap-corridor`.
- paint order: last wall `<use>` before the first door symbol; last symbol before the first tag.
- legend: door entries only when drawn (the existing hostile-input test with doors removed).
- neon snapshot updated on purpose; plain and Dyson snapshots unchanged.

## Byte-identical guard

Plain and Dyson SVGs dumped from `dev` before the change (throwaway script, as in steps 15–21):
bench and generated zelda and cyber M and L, layout seeds 1–5. After the refactor commit and at the
end: `diff -r` empty.

## By hand

CLI PNGs (resvg) of m-1 and l-1 (`--style neon`) and generated cyber M 1 and L 2: rectangles at
L/T corners and on short walls, tags in 3-unit rooms against numbers and glyphs, the S over a
coloured wall, cyber L 2's E and F apart. l-1 render time and SVG size into
`docs/neon-style.md` § Measurements (core: 0.9 ms, 38.8 kB).

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean; dump diff empty.
- `docs/neon-style.md` § Doors and gates: px sizes and colours as tuned, legend; measurements.
- `STATUS.md` neon step 3 ticked; render open point on tags and chevrons covers neon.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.
