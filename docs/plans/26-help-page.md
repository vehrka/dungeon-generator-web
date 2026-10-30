# Step 26: help page

Branch `feature/help-page` off `dev`. Graph step 3 in `STATUS.md`. A second viewer page,
`help.html`, linked from the header: what the tool is, the project's story, how it is built (the
pipeline), the grammar sheet, references. Hand-written HTML in the TE guide look, no Markdown
dependency. No engine, render or schema change, so no bench.

## Decisions

- **Vite multi-page**: `src/viewer/help.html` beside `index.html`; `vite.config.ts` lists both as
  build inputs (Vite 8 on Rolldown: `build.rolldownOptions.input` if `rollupOptions` is gone; check
  at implementation). Dev serves `/help.html` with no config. Built site: `dist/index.html`,
  `dist/help.html`, shared hashed CSS and font.
- **One stylesheet**: `help.html` links `style.css`; help-only rules appended there under a
  `/* Help page */` block, not a second file. Header shared markup: title, tagline, plus a `help` /
  `map` text action (underlined, as the exports). Header markup duplicated in both HTML files
  (two pages, no templating).
- **Prose in sentence case.** The guide look is all capitals for scanning; help paragraphs are read,
  so they follow the error-message exception (`text-transform: none`). Bands, headings, labels stay
  capitals. Body 13px Jura 300, line length capped ~70ch, left-aligned. `ref/webdesign/design.md`
  gains a "Help page" component entry for this.
- **Sections as the guide's numbered bands** (`① WHAT IT IS`, `② HOW IT WORKS`, `③ THE GRAMMAR`,
  `④ HOW WE BUILT IT`, `⑤ REFERENCES`), carbon band, circled number, as the panel's `h2`. Single
  column, page gutter 33px; same 800px breakpoint.
- **Pipeline as numbered steps, not a diagram**: generate → JSON → lay out → render, one short
  paragraph each (README "How it works" rewritten for a player/GM, not a contributor). The README's
  ASCII flow is dev-facing; an inline SVG diagram can come later if the steps read thin.
- **Grammar sheet by reference**: `<img src="../../docs/grammar.svg">`; Vite copies and hashes it
  (dev: inside the project root, so `server.fs.allow` default covers it). Wrapped in a horizontally
  scrollable figure (the sheet is wide) with a "open full size" link to the same asset. No copy in
  `src/viewer/`, so the staleness test on `docs/grammar.svg` still guards the page.
  *At implementation:* the HTML `src` broke in dev (not rewritten outside the root; `/docs/…` hit
  the SPA fallback) and the build never rewrites an `a href`. Instead an inline module
  `import sheet from "../../docs/grammar.svg?url"` sets both; dev serves it through `/@fs/`, the
  build hashes it into `dist/assets/`. The page needs JS for the sheet; the map page does anyway.
- **Links to docs go to GitHub** (`github.com/vehrka/dungeon-generator-web/blob/main/…`): the built
  site has no `docs/`. Only for design.md, dyson-style.md, neon-style.md, STATUS.md; the page must
  stand without them.
- **Story from the repo, not invented**: Python generator first (`101.02`), the thesis port, the
  TS generator taking over, the three map styles, graph and grammar views; built step by step with
  Claude Code. Dates from git history. README "How we built it" stays the contributor version.

## Change

- `src/viewer/help.html`: header, five sections, footer line (version 0.1.0, licence of Jura).
- `src/viewer/index.html`: header link to `help.html`.
- `src/viewer/style.css`: header link, help sections, prose, figure scroll.
- `vite.config.ts`: two inputs.
- `ref/webdesign/design.md`: help page component, prose case exception.
- `docs/design.md` § viewer: second page. README § Viewer: one line. STATUS graph step 3 ticked.

## Tests first

`tests/help.test.ts` (no DOM; the viewer's DOM is checked by hand, as before):
- `index.html` links `help.html`, `help.html` links `index.html`.
- every local `src`/`href` in `help.html` resolves to a file on disk (catches a moved
  `docs/grammar.svg`).
- `vite.config.ts` build inputs include both pages (read the config object, not the text).
- five section bands, numbered 1–5 in order.

`npm run build` then `dist/help.html` exists and its grammar image points into `dist/assets/`
(checked by hand, or in the test if the build is cheap enough; it is not run by `npm test` now).

## By hand

Chrome, `npm run dev` and `npm run build && npx vite preview`: both pages, header link both ways,
above and below 800px, sheet scrolls sideways not the page, full-size link opens the SVG, no
network request outside the site (font, image).

## Done when

- `npm run typecheck`, `npm test`, `npm run build` clean.
- Design docs, README, STATUS updated.
- `/code-review` on the branch, findings fixed or recorded, then merge into `dev`.

## Not in this step

- Live example maps (a seed in the three looks, graph beside map). Would need a page script running
  generator + layout, or committed SVGs with a staleness test. Ask if wanted.
