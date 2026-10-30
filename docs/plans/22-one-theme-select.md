# Step 22: one theme select

Branch `feature/one-theme-select` off `dev`. Asked 2026-10-30 after neon core: the viewer had a
theme select (zelda, cyber) and a style select (plain, dyson, neon); one select should do both.

## Change

- Generator theme `plain`, TS only: zelda's text (`THEMES.plain` equals `THEMES.zelda`), so a
  generated dungeon can be drawn plain. CLI `--theme plain`, JSON `"theme": "plain"`; schema 2
  unchanged (theme is a free string).
- Viewer: theme select zelda, cyber, plain; the style select, its preset and hand-pick logic go.
  `styleOf(theme)` in `state.ts`: `styleFor` of the theme, anything but a string plain. The look of a
  loaded file follows its theme, other or none plain.
- `layoutCache` and `draw`'s `place` argument removed: they let a style change skip the layout; a
  theme change sends new JSON (labels differ), so the cache never hit.
- CLI keeps `--style` (scripts, VTT exports); its default is still the theme's.
- Export name unchanged (`-dyson`, `-neon` suffix; plain none).

## Tests

`THEMES.plain` equals zelda's and a plain dungeon equals the zelda one but for `theme`; `parseTheme`
takes plain; `styleOf` on zelda, cyber, plain, foreign and non-string themes; CLI `--theme plain`
draws plain. `parseStyle`, `layoutCache` and the `place` tests removed with the code.

## Done when

Typecheck, tests, build clean; viewer checked in Chrome; `/code-review`, then merge into `dev`.
