# Step 19: Dyson viewer

Branch `feature/dyson-viewer` off `dev`. Dyson style step 5 in `STATUS.md`; design:
`docs/dyson-style.md` (style selection).

## Goal

A style select in the viewer, preset from the theme, changeable by hand; the SVG export name says
the style. Viewer only, no engine or render change, so no bench.

## Change

- `viewer/state.ts`:
  - `parseStyle(s) → MapStyle`, checked against `mapStyles` as `parseTheme` checks `THEMES`:
    `Unknown style X, expected one of catalogue dyson`.
  - `exportName(name, seed, style)`: `<name>-map-<seed>.svg` for catalogue, else
    `<name>-map-<seed>-<style>.svg`, so neon gets `-neon` without a change.
- `viewer/worker.ts`: `DrawRequest` gains `style`, passed to `draw`.
- `viewer/index.html`: `style` select in section 2 (layout), options catalogue and dyson.
- `viewer/main.ts`:
  - Preset rule: a load always presets from the JSON's theme (none, or not a string → dyson);
    generate presets when the theme differs, case ignored, from the one last preset from. Reroll,
    layout seed, corridors, size and generate with the same theme keep a style picked by hand.
  - Style change redraws through the worker, as the corridors box does. Layout cache added after
    review, see outcome.
  - `drawn` keeps the style it was drawn in, so the export name matches the map shown.

## Tests first

`tests/viewer.test.ts`:
- `parseStyle` accepts catalogue and dyson; rejects `""`, `Dyson`, `toString`, `__proto__`.
- `exportName`: no suffix for catalogue, `-dyson` for dyson.

Preset rule and redraw are DOM, checked by hand.

## By hand

`npm run dev`: classic opens in dyson, cyber in catalogue; catalogue picked on classic survives
reroll, size, corridors and generate; a theme change presets again; `tests/fixtures/ruin.json`
loads in its theme's style; export names in both styles.

## Outcome

Checked in Chrome on `npm run dev` (events dispatched by script, downloads intercepted): m-7
classic opens dyson; catalogue picked by hand survives reroll, size, corridors and generate with
the same theme; cyber presets catalogue, dyson picked by hand survives reroll, classic presets dyson
again. Loads: tor-barrow → dyson, cyber → catalogue, no theme → dyson. Export names `m-7-classic-map-7-dyson.svg`, `m-7-classic-map-7.svg`,
`m-7-cyber-map-7.svg`, `m-7-cyber-map-7-dyson.svg`. A style value not in `mapStyles` (option
added in devtools) → `Unknown style neon…`, map kept.

Restyle cost is the layout's: m-7 seed 7 ~2 s per change, l-1 ~0.1 s. Not cached; STATUS open
point. Reroll goes through `attempt`, since `run` parses the select.

Review: a load preset only on a theme change at first, compared case-sensitively and called
`styleFor` on an unchecked theme (crash on `"theme": 5`); generate and load changed `current`
before parsing the style. Fixed: load always presets, theme lowercased and non-strings dropped,
style parsed before `current` changes. Layout cache for restyle left open (STATUS).

Added on request: a loading bar in the result band while the worker runs (carbon hairline
sweeping its foot, static under reduced motion, `aria-busy`), and a `LayoutError` reworded by
`layoutFailed` in `state.ts`: no layout could be completed, try another layout seed, or (generated
only) another dungeon seed or size, then the stuck rooms. The engine message stays for the CLI.
Checked on L, dungeon seed 547668769: busy class and animation while running, amber band and the
three lines after.

Layout cache, on request after the 2 s restyle on m-7: `draw` takes the layout function as a last
argument (default `generate`); the worker passes one from `layoutCache()` (`state.ts`), one entry
keyed on `JSON.stringify([json, seed, config])`; `LayoutError` and `NonPlanarError` kept (they are
deterministic), so a style change on a failed layout fails at once, other errors tried again. A terminated worker starts empty. Main thread unchanged. m-7 seed 7: layout 2189 ms, restyle 2 ms
to catalogue, 133 ms to dyson (hatching); restyle of the failed L 547668769 at once.

Second review, fixed: the loading bar follows the worker's `busy`, so a panel error during a run
keeps it; the cache is a factory, so tests do not share it; only deterministic errors cached.
Not fixed: a style change during a run terminates the worker as any new run does, so its cache is
lost and that layout starts over (rare; the old run is what the user changed away from).
`draw`'s `place` argument kept over duplicating its meta lines in the worker. Main bundle +0.9 kB,
not the engine (tree-shaken). After a load without a seed, a style change shows the seed parse
error, as corridors does. The panel drops the engine's chain number, kept in its message for the CLI.

After merge (`feature/viewer-fixes`): the bar started off the band (left −30%, 1.2 s sweep), so
layouts of 0.1–0.2 s ended before it showed; now 3 px, in view from the first frame, back and forth
0.6 s. A loaded file fills the dungeon panel (`panelFor`: seed, size, theme where the generator
takes them, case ignored; no usable seed empties the field, an unknown size or theme leaves its
select). Shown, not promised: Enter rebuilds the file's dungeon only for a file from this generator
(Python files use another RNG). Review: bar moves by `transform`, not `left`; `isPreset` and
`isTheme` shared with `parseSize`/`parseTheme`.

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean.
- `docs/dyson-style.md` viewer bullet: preset rule, style change re-runs layout.
- `STATUS.md` step 5 ticked.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.
