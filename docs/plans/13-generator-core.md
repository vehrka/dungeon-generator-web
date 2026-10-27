# Step 13: generator core

Branch `feature/generator-core` off `dev`. STATUS step 13; context, decisions, scope and baseline:
`ref/generator-port.md`. Source: `../101.02_dungeon_generator` at `539c76c` (read-only).

## Python, what matters

- `DCombined` (`dungeon_fx11.py:422`): START/GOAL, `Start` rule, then `_process` loop: first
  unexpanded `nt` in vertex order, R last; one d20 per expansion; limits `MAXNODE` 300 / `MAXITER`
  200 → `_finish` (FINISH variants, locks still roll). Leftover `nt` become `n` (`_red_cleanup`).
- Vertex order: igraph index order. Deletion shifts indices but keeps relative order, so insertion
  order of live vertices gives the same expansion order. No index parity needed (decision 4).
- `_apply_variant`: objects first, then nodes, then edges as cross product of anchor neighbours;
  `oneway = anchor edge oneway or kind == "one"`. `_add_link` inserts one gate vertex per
  (source, target) pair.
- Gate kind in Python is parsed back from the name suffix (`" ON"`, `" OFF"`) in
  `can_enter` and `_gate_kind`. Port: store the kind on the vertex.
- Reduce: first mergeable edge in edge order, repeat; `simplify` is directed (`a→b` and `b→a`
  both survive), `combine_edges="first"`.
- Pacing: Dijkstra, undirected, edge weight 0.5 when either end is a gate (`lock`, `gate`, `s`).
- JSON ids are vertex indices, dense from 0; `_exits` indexes `nodes[id]`.

## Modules (`src/engine/generator/`, pure TS)

| File | What |
|---|---|
| `graph.ts` | directed multigraph with stable vertex ids in insertion order: add/delete vertex and edge, in/out/incident, `simplify`, undirected weighted `distances` |
| `grammar.ts` | `GRAMMAR`, `PACING`, `FINISH`, `BOSS_ROOMS`, `NEAR_BOSS`, `chooseVariant`, `finishVariant`, `pacedRoomVariant`, `spectralRadius` (tests) |
| `themes.ts` | 4 themes, `rewardVariant`; `ROOM_STYLE` descriptions, `SPECIAL_ROOMS` |
| `expand.ts` | `DCombined` expansion: start, expand, next vertex, progress, finish, apply variant, add link |
| `reduce.ts` | `reduce` (merge, simplify) |
| `solve.ts` | `unsolvableReasons`, `steps`, `progress` |
| `json.ts` | schema 2 export: exits, numbers, labels, dense ids |
| `index.ts` | `generateDungeon({ seed, size, theme }): DungeonJson` |

`GeneratorConfig` (`generator/config.ts`): `maxNodes` 300, `maxIter` 200, `nearBoss` 2. Not in
`LayoutConfig`: separate stage, separate seed. CLAUDE.md wording on `LayoutConfig` gets fixed in
step 14 with the rest of the generator rules.

Randomness: `rng(seed, "generator/d20")`, one stream; theme never draws. Object ids `<type>-<n>`
(n per type, from 1), names `<theme name> <n>` as Python.

## Grammar and theme data

570 + 131 lines of Python data. Port by a one-off dump (`python -c` over `GRAMMAR`, `PACING`,
`THEMES`, `ROOM_STYLE` → JSON, script in scratchpad, not committed) and turn it into typed TS
literals; hand-typing invites range typos the coverage test would catch only partly. Data parity
with Python is fine (decision 2 is about RNG); after this commit TS data is canonical.

## Fixes (decision 5)

- `addLink`: both gate legs take the same `oneway`.
- Assert no gate–gate edge after reduce (`Error` naming both gate ids). Exits then step only
  room → gate → room; drop the chain walk.

## Risks to check during the step, not decide now

- Merged rooms can give two two-way edges `a→b` and `b→a`, or a gate whose two legs reach the same
  room. Python keeps both. If `normalize` or layout chokes (property test below), measure how often
  and ask before changing reduce.
- Room-count percentiles drift from baseline because RNG differs: tolerance ±2 rooms on median,
  ±4 on p10/p90 over seeds 1–500. If off by more, it is a port bug, not RNG.

## Tests first (`tests/generator/<module>.test.ts`)

- graph: add/delete keeps order; simplify drops same-direction duplicates and self-loops, keeps
  first's attributes, keeps `a→b` + `b→a`; distances weighted, undirected.
- grammar: every rule's ranges cover 1–20 without overlap per preset that uses it; every `nt`
  label is a rule; `spectralRadius < 1` per preset; PACING tiers cover 1–20; FINISH variants
  exist and are non-recursive; theme rewards cover 1–20.
- solve (ports of `test_graph_utils.py`): key before lock solvable; key behind lock reported;
  missing key; one-way not walked back; `off` starts open; steps count a gate as one; progress
  0 → 1.
- reduce: same-type rooms merge keeping exits; one-way joined don't merge; merge keeps one-way
  exits; rooms with objects don't merge.
- expand: same seed → identical JSON; limits trigger finish and every key is still placed; paced
  rooms get harder (share of `challenge` in last tier > first); theme changes text only.
- json: BFS numbering by id among siblings; labels per rule; `found_in`/`opens`; dense ids.
- properties, seeds 1–500 × XS/S/M/L: solvable, `normalize` accepts, planar, no gate–gate edge,
  no mixed one-way gate, room-count percentiles near baseline. Slow: keep in its own file; 500
  if under ~10 s, else 200 in `npm test` and 500 in a script.

## Commits on the branch

1. graph + grammar/theme data + data tests.
2. expand, solve, reduce + their tests.
3. json, `generateDungeon`, property tests, baseline table in commit body.

## Done when

- typecheck, tests, build clean.
- Property run seeds 1–500 per size: 0 unsolvable, 0 rejected by `normalize`, percentiles table
  vs Python baseline in the commit body.
- Bench unchanged (no layout code touched): run once, same result as `dev`.
- `/code-review` before merge.
- `docs/design.md` (new generator section), `STATUS.md` step 13 updated in the same commit.

## Out of scope (step 14)

CLI and viewer generator controls, GM key Markdown, bench on generated dungeons, CLAUDE.md
generator rules, closing the gate-chain / mixed one-way open points.
