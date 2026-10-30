# Step 21: neon core

Branch `feature/neon-core` off `dev`. Neon style step 2 in `STATUS.md`; design:
`docs/neon-style.md`.

## Goal

A third painter: indigo-black page, dark corridors, role-coloured rooms with a stacked-stroke glow,
thin bright walls, mono type, role legend. Doors as the plain style's gaps and jambs for now (Dyson's
symbol set in step 3). Cyber maps turn neon. No engine, layout or schema change, so no bench.

## Change

- Rename first, own commit (`refactor(render)`): style `catalogue` → `plain` in code
  (`MapStyle`, `mapStyles`, painter, `styleFor`, `render` default, `exportName`, comments), CLI
  (`--style plain`), viewer option, tests, and the current docs (`docs/design.md`,
  `docs/dyson-style.md`, `docs/neon-style.md`, `STATUS.md`, this plan; their style-selection
  rules to the new mapping in the neon commit). Plans 09–20 and
  `ref/neon/` stay as written: history. SVG output does not name the style, so the dumps stay
  byte-identical; `--style catalogue` errors like any unknown style (no alias).
- `render/scene.ts`: `SceneRoom.type` (the room's schema 2 type), `Scene.start` / `Scene.goal`
  (room ids), so a painter reads the role from the scene alone. Plain and Dyson ignore them.
- `render/marks.ts`: the plain painter's `doorMark` moves here from `svg.ts`, unchanged, so `neon.ts`
  draws the interim doors without importing `svg.ts` (which imports the painters).
- `render/neon.ts`:
  - Tokens and role table at the top, from the design's § Tokens; fills as the table's hex
    (the mock-up's Python rounding, not reproduced at runtime).
  - `role(room, scene)`: start (`id === start`, type `st`, `exit`), goal (`id === goal`, `gl`),
    boss (`eb`, `em`), pickup (`key`, `bosskey`, `item`, `switch`, `lever`), treasure (prefix
    `gb:`), else `other-${number % 3}`. Exported for tests.
  - One `<polygon id="room-N">` per room in `<defs>`; map draws `<use>` of each: three glow
    passes (class `glow0..2` + role class: `fill:none`, width/opacity per token, miter), then
    fills, then walls (2 px). All glows before any fill. Role classes set `stroke` and `fill` once
    in the CSS, the `<use>` inherits, as Dyson's `#floors`.
  - Corridors before glows: `#141a2a` fill, `#2b3550` 1 px outline.
  - Doors: `doorMark` with neon CSS (gap in the corridor fill colour, jambs ink), gate tags `#ffd23f` outline and letter on the page colour, chevrons ink.
  - Numbers 17 px bold, glyphs ink, `roomMarks`.
  - CSS: text 12 px mono stack, ink; `.muted`, `.rule`, `.title` 18 px bold for the shared frame.
  - Legend: corridor, gate, secret, one-way as drawn, plus one swatch per role on the map (start,
    goal, boss, pickup, treasure; not the "other" tones).
- `render/svg.ts`: `MapStyle` and `mapStyles` gain `neon`, `painters` gains it;
  `styleFor`: cyber → `neon`, classic → `dyson`, any other theme or none → `plain` (decided
  2026-10-30, replacing "plain keeps no default"; was: anything not cyber → Dyson). A loaded
  JSON with a foreign theme, like the fixture's `tor-barrow`, now draws plain.
- CLI: `--style neon` works through `mapStyles`; help text lists it.
- Viewer: `<option value="neon">` in `index.html`, needed now since the preset for cyber is
  `neon`; options plain, dyson, neon;
  `exportName` already appends `-neon`. Step 5 shrinks to a by-hand check, or folds in.

## Tests first

- `tests/render.test.ts`, neon: standalone SVG, page `#0b0814`; one floor polygon per room and
  corridor; three glow `<use>` per room, all before the first fill; numbers and labels once,
  escaped (hostile input); no `<filter>`; same input same string; fixture snapshot. `role` on every
  row of the table, `exit` start, unknown type other, `number % 3`; legend lists only roles
  drawn.
- `styleFor`: cyber, Cyber → neon; classic, Classic → dyson; tor-barrow, empty, undefined → plain.
- `tests/scene.test.ts`: `type`, `start`, `goal` on the fixture.
- CLI: `--style neon` writes SVG and PNG; cyber default is neon.
- Existing tests that change: `draw` picks-the-style test (fixture now plain, cyber neon, classic
  dyson); CLI default-follows-theme test; viewer preset if it tests a non-classic theme.

## Byte-identical guard

Plain and Dyson SVGs dumped from `dev` with an explicit style before the change (throwaway
script, as in steps 15–16): bench and generated, 240 maps each. After the `doorMark` move and the
scene fields: `diff -r` empty.

## By hand

CLI PNGs (resvg) of m-1 and l-1 (`--style neon`) and a generated cyber L; compare with
`ref/neon/m-1-cyber-neon.png` on generated cyber M seed 1. l-1 render time and SVG size into
`docs/neon-style.md` (target < 100 ms, < 1 MB; estimate ~40 kB). Key column width at 12 px mono
(DejaVu Sans Mono ≈ 7.2 px per character, under the 7.5 estimate). Shared-wall seams on L maps:
keep the open point or note it reads fine.

## Risk

- `<use>` inheriting role classes in resvg: Dyson's `#floors` works the same way, low.
- Glow on L maps overlapping neighbours' fills: glows under all fills, by design.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean; dump diff empty.
- `STATUS.md` neon step 2 ticked with measurements; `docs/neon-style.md` open point on glow cost
  closed with the l-1 number.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.

## Outcome

Three commits: rename (`catalogue` → `plain`, no alias); scene `type`, `start`, `goal` and
`doorMark` into `marks.ts`; the neon painter. Plain and Dyson dumps before and after the refactors:
221 maps each (bench, generated classic and cyber M and L, layout seeds 1–5, failures skipped),
`diff -r` empty.

l-1, layout seed 1, render only, mean of 20: plain 0.8 ms 31.0 kB, neon 0.9 ms 38.8 kB, Dyson
102 ms 421 kB. PNGs of m-1, l-1, generated cyber M 1 (matches `ref/neon/m-1-cyber-neon.png` but
for the 1-unit pad and the role legend) and cyber L 2: roles read at a glance. Seen, left for later:
shared walls show one colour (open point); two gate tags on one corridor end crowd (cyber L 2,
E and F), the plain style's placement until the doors step uses `tagAt`.

Decided on the way: plain is the default for any theme but cyber and classic (was Dyson); `styleFor`
compares strings rather than indexing an object, so a `constructor` theme stays plain. Role tone
for a non-integer room number is other-0, as numbers are untyped at runtime.

Review, fixed: glows ran across corridor doorways (corridors now paint over the glows, under the
fills); README still said `catalogue|dyson` and Dyson for every non-cyber theme; `role` read
treasure as `gb:` prefix while `shapeRules` and the scene read the `gb` family, so a bare `gb` room
was laid out as treasure but coloured other; `px` twice per vertex; Dyson doc's CLI line. Not
fixed: the door loop and door legend copied from the plain painter, and the dead `gap-corridor`
rect (same fill as `gap`, offset tuned for a 1 px wall), since the doors step replaces neon's
doors with Dyson's symbol set; `role` does not guard a non-string `type`, as layout and scene
already throw on one first (the `normalize` open point in `STATUS.md`).
