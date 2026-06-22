# Till Breuer CV

Static HTML/CSS CV published with GitHub Pages. Sass is used as the styling source, while the compiled CSS is committed for simple local preview.

## Local preview

Open `index.html` in a browser. No package manager or build step is required.

## Styles

This project expects `nvm` and the Node version pinned in `.nvmrc`.

On a fresh machine:

```sh
nvm install
nvm use
npm install
```

Build after changing `src/styles/styles.scss`:

```sh
npm run build
```

The same steps are available through `make` (each target uses `nvm` automatically):

```sh
make install   # npm install
make build     # compile Sass -> assets/styles.css
make watch     # rebuild on change
make check     # build + validate HTML + verify committed CSS is up to date
```

For iterative styling work, run `make watch` (or `npm run watch`).

Themes are CSS custom-property blocks generated from the Sass `$themes` map. Switch the active theme by changing `data-theme` on the `<html>` element in `index.html`.

## PDF

Use the browser print dialog on `index.html` and save the page as PDF. Print-specific CSS is included in `assets/styles.css`.

## Deployment

GitHub Pages is built by Actions (`.github/workflows/pages.yml`). On every push to `master` (or a manual run via the Actions tab), the workflow installs dependencies, compiles Sass, validates the HTML, verifies the committed CSS is current, then uploads the repository as a Pages artifact and deploys it.

Typical flow:

```sh
make build                # preview CSS locally
git add -A && git commit -m "..."
make deploy               # runs make check, then pushes to origin
gh run watch -R tilt/cv   # optional: follow the deploy
```

`make deploy` only pushes; the actual Pages deployment runs in Actions.

One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions** (otherwise the deploy step rejects builds from `master`).
