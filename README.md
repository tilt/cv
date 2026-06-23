# Till Breuer CV

Multilingual (EN/DE) static CV published with GitHub Pages. Content lives in
modular YAML data files, rendered to HTML via Nunjucks templates and styled with
Sass. Bilingual PDFs are generated deterministically from the built HTML with
Playwright (headless Chromium).

- English at `/`, German at `/de/`
- Brief English at `/brief/`, brief German at `/de/brief/`
- GitHub Pages project base-path support (`/cv`)
- Theme support, full and brief variants
- Build-time data validation and HTML validation
- Local Font Awesome icons copied from a pinned npm dependency; no analytics, no Hugo

## Requirements

- Node — the version pinned in [`.nvmrc`](.nvmrc) (managed via `nvm`)
- Chromium for Playwright — installed once via `npx playwright install chromium`
  (only needed for PDF generation)

## Installation

```sh
nvm install
nvm use
npm install
npx playwright install chromium   # for PDF generation
```

`make install` does all of this (npm dependencies **and** the Chromium browser).

## Local preview

```sh
make serve            # build the web output and start a local server
```

Open the printed URL. To regenerate the PDFs locally, run `make pdf`.

For iterative styling, run `make watch` (or `npm run watch:css`).

## Project structure

```
data/
  en/                 English content, one file per section
    metadata.yaml     title, abstract, section labels, icons, lang switcher, footer
    education.yaml
    experience.yaml
    skills.yaml
    interests.yaml
    references.yaml
  de/                 German content, mirrors data/en/
templates/            Nunjucks templates and partials
src/
  data.mjs            Loads + merges the per-section YAML, validates it
  build.mjs           YAML + Nunjucks → dist/ (validates before rendering)
  generate-pdf.mjs    Serves dist/ and renders the EN/DE PDFs with Playwright
  validate-data.mjs   Standalone data validation CLI
  styles/             Sass source
thesis.pdf            Static source asset (linked from the CV)
dist/                 Generated output (gitignored)
```

## Modular data

Each language is assembled from the section files under `data/<lang>/`. The
build merges them in memory before rendering, so editing a single section (e.g.
`data/en/experience.yaml`) does not touch the rest. Education and experience
entries carry a stable `id`, which keeps the two languages aligned and gives
each entry a DOM id (`#education-<id>`, `#experience-<id>`).

## Data validation

Validation runs automatically inside `npm run build` and can also be run on its
own:

```sh
npm run validate:data
```

It checks: required fields; supported languages; matching entry IDs and ordering
between English and German; matching `variants` declarations; matching skill
category/item IDs; valid theme names; valid and unique PDF filenames. Errors
name the offending language, file, and field, e.g.:

```
[de] data/de/experience.yaml: "experience" ids/order [...] do not match [en] [...]
```

## Variants

Every education/experience entry has a `variants` array. The full variant
renders the complete CV; `brief` filters to entries tagged `brief` and uses
purpose-written `brief_summary` / `brief_points` fields where present. Skills
are rendered in both variants from categorized data.

The default build publishes both variants side by side:

```sh
npm run build
```

Output routes:

- Full: `/` and `/de/`
- Brief: `/brief/` and `/de/brief/`

Rendered pages include a same-language switch between full and brief variants,
plus the existing language switcher.

For a targeted local rebuild of only one variant:

```sh
npm run build:html -- --variant brief
```

If a matching template (`brief.njk`) exists it is used; otherwise `full.njk` is
rendered with the filtered data. The brief template intentionally omits
interests and references to keep the PDF to one A4 page.

## Themes

Themes are CSS custom-property blocks generated from the Sass `$themes` map
(`classic`, `clean`). Switch the active theme via the `theme` field in
`data/<lang>/metadata.yaml`.

## Base path

By default, asset and link URLs are root-relative (e.g. `/assets/styles.css`).
For GitHub project Pages served under a subpath like `/cv/`, pass `--base` to
**both** the build and the PDF generator:

```sh
npm run build:html -- --base /cv
npm run pdf -- --base /cv
```

Or set the `BASE_PATH` environment variable. The GitHub Actions workflow sets
this automatically from the Pages configuration.

## Build

```sh
npm run build        # compile CSS + generate full + brief HTML → dist/ (web build)
npm run build:css    # CSS only
npm run build:html   # HTML only, both variants unless --variant is passed
npm run pdf          # render full + brief EN/DE PDFs from dist/ (requires Chromium)
npm run build:prod   # complete production build: web build + PDFs
```

The same steps are available through `make` (each target uses `nvm`):

```sh
make install      # npm install + Chromium
make build        # web build → dist/
make build-brief  # targeted brief HTML build → dist/brief/ and dist/de/brief/
make pdf          # web build + full + brief PDFs → dist/
make build-prod   # complete production build
make watch        # rebuild CSS on change
make serve        # build + start local server
make check        # fast: web build + validate HTML
make check-prod   # full: data validation + build + validate HTML + PDFs
```

## Bilingual PDF generation

`src/generate-pdf.mjs` renders all full and brief PDFs **from the already-built
HTML** — it does not rebuild the site. It:

- serves `dist/` over a local HTTP server (honouring the base path),
- loads `/` (English) and `/de/` (German),
- waits for `document.fonts.ready`,
- verifies the expected section structure, that the stylesheet applied, and that
  the Font Awesome icon font loaded, failing clearly if a page, style, font or
  same-origin asset is missing,
- writes tagged PDFs with outlines and print backgrounds, using CSS `@page`
  sizing via Playwright's `preferCSSPageSize`,
- fails if a brief PDF is not exactly one A4 page,
- always closes the browser and server, including on error.

The full output filenames match the existing public links
(`lebenslauf_till_breuer.pdf`, `lebenslauf_till_breuer_de.pdf`). Brief PDFs are
written as `lebenslauf_till_breuer_brief.pdf` and
`lebenslauf_till_breuer_kurz.pdf`. All PDFs are written into `dist/`. Full print
styling targets a compact, two-column, ~3-page A4 layout; brief print styling
targets one A4 page. Individual entries are kept from splitting across pages.

## Deployment

GitHub Pages is built by Actions ([`.github/workflows/pages.yml`](.github/workflows/pages.yml)).
On every push to `master` the workflow installs dependencies (npm cached) and
Chromium, validates the data, builds CSS + HTML with the correct Pages base path,
validates the HTML, generates both PDFs, and deploys `dist/` as a Pages artifact.

Typical flow:

```sh
make build-prod
git add -A && git commit -m "..."
make deploy               # runs make check-prod (full artifact), then pushes to origin
```

One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions**.

## Generated vs. tracked files

- Generated (gitignored): everything under `dist/`, including the full and brief
  CV PDFs, copied Font Awesome fonts, and `thesis.pdf`. The CV PDFs are **not**
  checked in — they are produced from the HTML on every build.
- Tracked sources: `data/`, `templates/`, `src/`, `package-lock.json`, and
  `thesis.pdf` (a static source asset linked from the CV). Font Awesome is a
  pinned npm dependency and its webfont files are copied into `dist/` during the
  build.
