# Delve Generator — Style Reference

> teenage engineering product guide, applied to a map tool: flat neutral planes, all-capital
> technical type, dark numbered bands for sections, one chromatic note (amber) for gates and errors.

**Theme:** light. **Sources:** teenage.engineering (catalogue: palette, hairlines, no radius, no
shadow) and its product guides, e.g. teenage.engineering/guides/ep-35 (all capitals, dark section
bands with circled numbers, lighter subsection bands, underlined links). Implemented in
`src/viewer/style.css` (viewer) and `src/render/svg.ts` (map); tokens in `cssvars`. When this
file, `cssvars` and the code disagree, fix them in the same change.

Two surfaces, two type rules:

- **Viewer UI** (`src/viewer/`): the guide look. Jura, all capitals, bands.
- **Map SVG** (`src/render/`): the catalogue look. System sans, weight 100/300, sentence case. An
  exported SVG must render anywhere, so it never depends on a web font.
- **Dyson map style** (`src/render/dyson.ts`): not this reference; ink on white, see
  `docs/dyson-style.md`.

## Colors

| Token | Value | Role |
|-------|-------|------|
| `--color-canvas-mist` | `#f6f8f7` | Page background; SVG background; text on black |
| `--color-ink-black` | `#000000` | Text, input borders, room walls, primary button |
| `--color-carbon` | `#231f20` | Section bands (the guide's index band); primary button hover |
| `--color-band` | `#d1d3d4` | Result band (the guide's subsection band); text-action hover |
| `--color-steel-gray` | `#e5e5e5` | Hairlines; text on carbon; corridors in the map |
| `--color-graphite` | `#b2b2b2` | Disabled controls; muted text in the map (room numbers in the key, subtitle) |
| `--color-muted` | `#6d6e71` | Helper text in the viewer (graphite is too faint for Jura 300 at 11px) |
| `--color-amber` | `#f0a000` | State only: gate tags in the map, error band in the viewer |
| (white) | `#ffffff` | Map plane in the viewer, room fill, input and select fill |

Neutrals do all the work. Amber is the only colour and always means "attention": a gate or an
error. Never decorative, never a second accent.

## Type

### Viewer: Jura

- `Jura` (SIL OFL 1.1, `src/viewer/fonts/OFL.txt`), Latin subset woff2 (21 kB), self-hosted, weight
  axis 300–700. Stand-in for TE's TechnoType, which is not free. Fallback stack: Inter, Helvetica
  Neue, Arial, Noto Sans, DejaVu Sans, sans-serif. No font from the network.
- `text-transform: uppercase` on `body`, `letter-spacing: 0.02em`. TechnoType's glyphs are
  capitals; Jura gets there by transform, so the markup stays lower case.
- Weight 300 everywhere. Hierarchy comes from size and bands, never from weight.
- Error messages and help-page prose are the exception: sentence case (`text-transform: none`),
  they are read, not scanned.

| Role | Size | Line height | Notes |
|------|------|-------------|-------|
| Title (`h1`) | 32px (26px narrow) | 1.11 | letter-spacing −0.02em |
| Section band (`h2`) | 19px | 1.15 | on carbon |
| Result name, inputs, primary button | 15px / 14px | 1.4 | |
| Body, text actions, errors | 13px | 1.4 | |
| Field labels, helper text, header tagline | 11px | 1.4 | helper in muted |
| Circled section number | 12px | — | |

### Map: system sans

- Inter, Helvetica Neue, Arial, Noto Sans, DejaVu Sans, sans-serif; weight 100 for text, 300 for
  room numbers, title and headings. Sentence case as the JSON gives it.
- Sizes: 13px text, 19px room numbers and title, 10px gate tag letters.

## Shape and space

- Radius 0 everywhere, with one exception: the circled section number (`border-radius: 50%`), as in
  the guide's index.
- No shadows, no gradients. Depth is a tonal band (carbon, band grey) or a 1px hairline.
- Spacing tokens: 15px (element gap, panel inset), 22px, 33px (page gutter). Inside the panel the
  rhythm is tighter: 10px under bands and helper lines, 2–4px between a field and its helper.
- Panel 300px. Page breakpoint 800px.

## Components (viewer)

**Header.** Title left, two-line tagline right (11px), then the page link (`help` on the map page,
`map` on the help page) as a text action at 13px; 1px steel-gray rule below. Narrow: stacked,
left-aligned.

**Page.** Two columns: map left (`minmax(0, 1fr)`), settings panel right (300px, 1px steel-gray
rule on its left). The panel is sticky and scrolls on its own, so the result stays in view while
a tall map scrolls. Below 800px the panel stacks under the map.

**Map pane.** The SVG on white, `max-width: 100%`, 33px gutter. Drop target: 1px dashed black
outline inset 8px.

**Result band.** First in the panel, band grey, full panel width. First line the dungeon name at
15px, then rooms, seeds, ms, one per line. Then `EXPORT svg json key` as text actions. Error: the
band turns amber and shows the message in sentence case. Busy: a 3px carbon bar goes back and forth
along the band's foot while a layout runs, in view from the first frame (static under reduced
motion).

**Section band.** `h2` full panel width, carbon background, steel-gray text, 19px, a circled
number (22px circle, 1px border in the text colour) then the name: `① DUNGEON`, `② LAYOUT`,
`③ FILE`.

**Field.** Label (11px) above the control, full width; helper line (11px, muted) below.

**Text input / select.** White, 1px black border, radius 0, 14px, 4px 8px padding. Select: native
arrow removed, a hairline chevron (10×6 SVG, 1px black stroke) at right 8px.

**Primary button** (generate). Full width, black, canvas-mist text, 15px. Hover carbon. One per
panel.

**Text action** (reroll, load json, exports). Reads as the guide's links: underlined (offset 3px),
no box; hover fills band grey (canvas mist inside the result band). Disabled: graphite, no
underline.

**Checkbox.** Native, `accent-color` black, label to its right.

**Help page** (`help.html`, `body.doc`). One column, 33px gutter (15px narrow), numbered carbon
bands full width as in the panel (`① WHAT IT IS` … `⑤ REFERENCES`). Prose 13px Jura 300 in
sentence case, capped at 70ch, left-aligned; bold terms stay capitals at weight 300. Subheadings
and pipeline steps as subsection bands (band grey, 13px, capitals, 70ch), steps numbered by a CSS
counter. Story as a date column (11px, muted) beside the text. The grammar sheet at its own size
on white with a steel-gray hairline, scrolling sideways in its frame, never the page; caption 11px
muted with an `open full size` link. Links in prose underlined (offset 3px), band grey on hover.
Footer 11px muted over a steel-gray hairline.

## Components (map)

- Background canvas mist; rooms white with 1px black walls; corridors steel gray with 1px black
  walls.
- Room number centred in the room's largest rectangle, 19px weight 300; glyphs (start, goal, key,
  item, switch) as 1px black line drawings, no fills.
- Gates: amber square tag with a 10px letter; one-way chevrons 1.5px black.
- Key column right of the map: title 19px, subtitle muted, headings weight 300 over a steel-gray
  hairline, room numbers muted, gate tags as in the map, legend glyphs as in the map.

## Do

- Keep hierarchy in size, case and bands; keep weight at 300 (UI) or 100/300 (map).
- Use carbon bands for sections, the band grey for results and hover, hairlines for everything
  else.
- Keep amber for state: gates, errors.
- Keep helper text to one line where the panel width allows, always below its control.
- Test both widths (above and below 800px) and a short window (~870px): the result band and the
  generate button must be visible without scrolling the page.

## Don't

- No radius except the circled numbers; no shadows, gradients, or weights above 300.
- No second accent colour; no colour as decoration.
- No web font in the SVG; no font, script or style from the network in the viewer.
- No centred body text; everything is left-aligned except the header tagline (right).
- No new panel section without a number and a band.
