# Till Breuer CV

Multilingual (EN/DE) static CV published with GitHub Pages. Content lives in YAML data files, rendered to HTML via Nunjucks templates. Sass is used for styling.

## Local preview

```sh
make serve
```

This builds the site and starts a local server. Open the printed URL to preview, then use the browser print dialog (Cmd+P) to save as PDF.

## Project structure

```
data/           YAML content files (one per language)
templates/      Nunjucks templates
src/build.mjs   Build script: YAML + Nunjucks → dist/
src/styles/     Sass source
dist/           Generated output (gitignored)
```

## Setup

This project expects `nvm` and the Node version pinned in `.nvmrc`.

```sh
nvm install
nvm use
npm install
```

## Build

```sh
npm run build          # compile CSS + generate HTML → dist/
npm run build:css      # CSS only
npm run build:html     # HTML only
```

The same steps are available through `make` (each target uses `nvm` automatically):

```sh
make install   # npm install
make build     # full build → dist/
make watch     # rebuild CSS on change
make serve     # build + start local server
make check     # build + validate HTML
```

For iterative styling work, run `make watch` (or `npm run watch:css`).

### Base path

By default, asset and link URLs are root-relative (e.g. `/assets/styles.css`). For GitHub project Pages served under a subpath like `/cv/`, pass `--base`:

```sh
npm run build:html -- --base /cv
```

Or set the `BASE_PATH` environment variable. The GitHub Actions workflow sets this automatically.

## Themes

Themes are CSS custom-property blocks generated from the Sass `$themes` map. Switch the active theme by changing the `theme` field in the YAML data files.

## Internationalization

Content is defined per language in `data/cv.en.yaml` and `data/cv.de.yaml`. The build generates `dist/index.html` (English) and `dist/de/index.html` (German) with a language switcher in the header.

## Variants

The build supports CV variants (e.g. a brief one-page version). Each entry in the YAML data has a `variants` array. Pass `--variant brief` to filter entries:

```sh
node src/build.mjs --variant brief
```

If a matching template (`brief.njk`) exists it is used; otherwise `full.njk` is rendered with the filtered data.

## PDF

Use the browser print dialog on the built pages and save as PDF. Print-specific CSS hides the language switcher and footer.

## Deployment

GitHub Pages is built by Actions (`.github/workflows/pages.yml`). On every push to `master`, the workflow builds CSS + HTML, validates, then deploys `dist/` as a Pages artifact.

Typical flow:

```sh
make build
git add -A && git commit -m "..."
make deploy               # runs make check, then pushes to origin
gh run watch -R tilt/cv   # optional: follow the deploy
```

One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions**.
