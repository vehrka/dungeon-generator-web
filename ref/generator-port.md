# Generator port: context

Context for STATUS steps 13–14: port the Combined grammar of `../101.02_dungeon_generator` into
this app. Source pinned at generator commit `539c76c` (XS preset). The Python repo is read-only
reference from here on: after step 14 the TS generator is canonical.

## Decisions (2026-10-27)

1. **TS canonical.** Grammar, themes and fixes live here once ported; Python is frozen, not mirrored.
2. **No seed parity.** Generator randomness through `rng(seed, stream)` like the rest of the engine;
   a seed gives a different dungeon than in Python. Correctness is checked by properties and
   statistics, not by diffing Python output.
3. **No uid compatibility.** Object ids derived from the dungeon (e.g. `key-1`), not
   `SystemRandom` strings: same seed → byte-identical JSON.
4. **No index parity.** igraph vertex renumbering, edge order after `simplify`, etc. need not be
   copied; only the behaviour below matters.
5. **Fix the known generator issues in the port** (see Fixes), not in `normalize`.
6. Cave shapes dropped.

## Scope

Port (Python file → lines):

| Python | Lines | What |
|---|---|---|
| `grammar/combined.py` | 570 | `GRAMMAR` rules and variants (data), `PACING`, `FINISH`, `choose_variant`, `finish_variant`, `paced_room_variant`, `spectral_radius`/`simulate` (tests only) |
| `dungeon_fx11.py` `DCombined` | ~170 | expansion: `_dungeonstart`, `_expand_vertex`, `_next_red_vertex`, `_progress`, `_finish`, `_apply_variant`, `_add_grammar_vertex`, `_add_link` |
| `utils/graph_utils.py` | ~250 used | `Dungeon` base (`generate`, `_process`, `_reduce_graph`, `_mergeable_edge`, `_merge_rooms`, `_new_object`), `unsolvable_reasons`, `steps`, `progress` |
| `utils/dungeon_json.py` | 186 | schema 2 export: `_exits`, `_numbers` (BFS from START), `_label`, `SPECIAL_ROOMS` |
| `grammar/themes.py` | 131 | themes `zelda` (default), `cyber`, `tor-barrow`, `tor-dwarf` (data) |
| `utils/dungeon_render.py` | `ROOM_STYLE` only | default room descriptions for labels; colours not needed |
| `utils/dungeon_key.py` | 106 | Markdown GM key from the JSON (step 14) |

Tests to read for intent: `tests/test_combined.py`, `test_dungeon_json.py`, `test_dungeon_key.py`,
`test_themes.py`, `test_graph_utils.py`.

Skip: legacy `D24`/`D30` and `CodedDungeon` (unsolvable, unbounded), Graphviz/dot render
(`dot_utils`, `dungeon_render` except `ROOM_STYLE`, `grammar/render.py`), matplotlib
`--show-graph`, `--no-reduce` (only if not wanted in the viewer), `refs/relations`.

No dependency needed: igraph is used only for add/delete vertex and edge, `incident`, `neighbors`,
`are_adjacent`, `get_eid`, `select`/`find`, `simplify` (drop duplicate edges and self-loops) and
weighted `distances` (Dijkstra, undirected). A small graph module covers it.

## Behaviour to keep

- **Start**: vertices START (`st`) and GOAL (`gl`); apply the `Start` rule between them with a d20
  for the size preset (XS, S, M, L; default M).
- **Rolls**: one d20 per rule application, `choose_variant(symbol, preset, roll)` picks the variant
  whose range for the preset holds the roll. Missing preset range = never chosen.
- **Expansion order**: first unexpanded non-terminal, R rooms only when no other non-terminal is
  left (so pacing sees the final layout). `GB` rolls on the theme's `rewards` table.
- **Variant application** (`_apply_variant`): objects of the variant created first, named
  `<theme object name> <n>` (n = count of that type so far); anchor `prev` connects to every
  in-neighbour of the replaced vertex, `next` to every out-neighbour, each edge one-way when the
  anchor edge was one-way or its kind is `one`. Node kinds: `nt` (non-terminal), `room`, `item`
  (pickup, room type = object type, name `Get <object>`), `switch` (switch or lever), `special`
  (`EXIT`). Gate kinds (`lock`, `state`, `on`, `off`, `secret`) become a gate vertex between the
  two ends; `secret` requires nothing.
- **Limits**: `maxnodes` 300, `maxiter` 200. When hit, finish mode: recursive rules take their
  `FINISH` variant (L → room, S → end), lock rules still roll so every key is placed.
- **Pacing**: R content by progress between START (0) and the boss `eb` (1) in steps; crossing a
  gate counts 1 step (each gate leg 0.5), directions ignored. Rooms within `NEAR_BOSS` (2) steps of
  `em`/`eb` use the last tier.
- **Reduce**: merge rooms of `MERGE_TYPES` (`e n p t c`) joined by a two-way edge, never rooms
  holding objects, never across one-way edges; the kept room takes all edges (with attributes);
  then drop duplicate edges and self-loops.
- **Solvability**: explore from START collecting objects, repeat until nothing changes; a gate is
  open when all its objects are collected; `off` gates open at start. Reasons: `GOAL unreachable`
  and each blocked gate with its missing objects. Combined is solvable by construction: assert it.
- **JSON (schema 2)**: as consumed by `normalize` today (`engine/types.ts` `DungeonJson`): meta
  (`grammar`, `seed`, `size`, `theme`), `start`, `goal`, `solvable`, `unsolvable_reasons`, nodes
  (rooms with `objects`, `number`, `label`; gates with `gate`, `requires`), edges (`oneway`),
  objects (`found_in`, `opens`). Room `number`: BFS from START over room-to-room exits, neighbours
  by id. `label`: theme room description, else `SPECIAL_ROOMS`, `gb: <reward>`, `Pickup: …`,
  `Switch: …`, `Lever: … (starts OFF)`, `ROOM_STYLE` description, else name. Keep schema 2 as the
  interchange format: loading a JSON file in the viewer and CLI keeps working.
- **Theme**: text only. Same seed and size give the same graph with any theme. TS adds `plain`
  (zelda's text) so the viewer's one theme select can pick the plain map style (2026-10-30).

## Fixes (decision 5)

- **Mixed one-way gates.** `_add_link` makes the leg into the gate one-way and the leg out of it
  always two-way, so `normalize` rejects the gate ("one-way edges that disagree on direction").
  Measured on Python, seeds 1–500 per size: XS 0, S 0, M 8, L 52 dungeons affected (bench L-5,
  gate 22, is one). Fix: both legs carry the same `oneway`. Then `normalize`'s error stays as a
  guard for hand-edited JSON.
- **Gate chains** (gate–gate edges). The exporter walks through gate chains, `normalize` rejects
  them. 0 of 2000 Python dungeons have one, and the grammar cannot make one: gate edges touch an
  anchor only in `SW` (`h → next`, state), and no non-terminal gets a gate as out-neighbour before
  it expands. Fix: assert in the generator (error, not collapse); drop the gate-chain walk from
  exits.

## Baseline (Python, seeds 1–500 per size, after reduce)

| Preset | rooms p10 | median | p90 | unsolvable |
|---|---|---|---|---|
| XS | 6 | 6 | 8 | 0 |
| S | 10 | 13 | 19 | 0 |
| M | 12 | 18 | 29 | 0 |
| L | 16 | 26 | 44 | 0 |

The port's distribution should land near these (different RNG, same grammar). README's table counts
nodes before reduce, so it is higher.

## Tests (no parity, decision 2)

- Grammar data: every rule's d20 ranges cover 1–20 without overlap for each preset that uses it;
  every `nt` label is a rule; `spectral_radius < 1` per preset; theme rewards cover 1–20.
- Generator: same seed → same JSON; every dungeon of seeds 1–N per size is solvable, planar,
  accepted by `normalize`, no gate–gate edge, no mixed one-way gate; room-count percentiles near
  the baseline; one-way loops keep their direction after reduce; theme changes text only.
- JSON: numbering BFS order, labels, objects `found_in`/`opens`.
- Layout: bench on generated dungeons (see STATUS step 14).

## Open questions for the plans

- Bench: keep the 16 committed files (generator commit 573478c) as the layout regression set, add
  generated dungeons, or replace them. L-5 is skipped today because of the mixed one-way gate.
- Viewer: generator controls (size, theme, dungeon seed) next to the layout seed; what reroll does
  (dungeon, layout, or both buttons); export JSON and GM key.
- CLI: generate in the same command (`--size --theme --dungeon-seed`) or a separate subcommand.
- Fixture `tests/fixtures/ruin.json` stays a Python-made file (it pins `normalize`).
- Project `CLAUDE.md` "Don't change the generator or its JSON schema" and the `normalize` rules
  become stale in step 14: rewrite them for the TS generator.
