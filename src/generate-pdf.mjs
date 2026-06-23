import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { existsSync, openSync, readSync, closeSync } from 'fs';
import { resolve, dirname, normalize, extname, join, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { LANGUAGES, LANG_HOME, loadAllLanguages, validateData } from './data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

// Base path handling mirrors the build: an empty base serves the site at "/",
// a project Pages base such as "/cv" serves it under that prefix.
const basePath = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.BASE_PATH || '').replace(/\/+$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
};

// Section structure that every rendered page must contain. Verified in the
// browser before a PDF is written so a broken template fails loudly.
const REQUIRED_SELECTORS = [
  '#header__name',
  '#contact',
  '#abstract',
  '#education',
  '#experience',
  '#skills',
  '#interests',
  '#references',
  '#footer',
];

function log(msg) {
  console.log(msg);
}

/** Serve dist/ over HTTP, honouring the configured base path. */
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

      // Strip the base path prefix so "/cv/de/" maps to dist/de/.
      if (basePath) {
        if (urlPath === basePath) urlPath = '/';
        else if (urlPath.startsWith(basePath + '/')) urlPath = urlPath.slice(basePath.length);
        else {
          res.writeHead(404).end('Not found');
          return;
        }
      }

      if (urlPath.endsWith('/')) urlPath += 'index.html';

      // Resolve safely within dist, rejecting path traversal: the resolved
      // path must stay inside dist (relative path neither escapes nor absolute).
      const filePath = normalize(join(dist, urlPath));
      const rel = relative(dist, filePath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });

  // Reject on startup errors (e.g. EPERM/EADDRINUSE) instead of leaving an
  // unhandled exception.
  return new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', rejectPromise);
      resolvePromise(server);
    });
  });
}

/** Read the first bytes of a file to confirm it is a real PDF. */
function isPdf(path) {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(5);
    readSync(fd, buf, 0, 5, 0);
    return buf.toString('latin1') === '%PDF-';
  } finally {
    closeSync(fd);
  }
}

async function generate() {
  if (!existsSync(dist) || !existsSync(resolve(dist, 'index.html'))) {
    throw new Error('dist/ is missing or empty — run "npm run build" before generating PDFs.');
  }

  // Validate data so the PDF filenames/paths we rely on are trustworthy.
  const byLang = loadAllLanguages(root);
  const dataErrors = validateData(byLang);
  if (dataErrors.length > 0) {
    throw new Error(`Data validation failed (${dataErrors.length}):\n  - ${dataErrors.join('\n  - ')}`);
  }

  const server = await startServer();
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  log(`Serving dist/ at ${origin}${basePath || ''}/`);

  // The server must be closed even if the browser fails to launch, so its
  // lifecycle wraps the browser's.
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      await renderAll(browser, byLang, origin);
    } finally {
      await browser.close();
    }
  } finally {
    await new Promise((r) => server.close(r));
    log('\nBrowser and server closed.');
  }
}

async function renderAll(browser, byLang, origin) {
  for (const lang of LANGUAGES) {
    const data = byLang[lang];
    const pdfName = data.pdf_file;
    const pagePath = `${basePath}${LANG_HOME[lang]}`;
    const pageUrl = `${origin}${pagePath}`;
    const outPath = resolve(dist, pdfName);

    log(`\n[${lang}] ${pageUrl} → dist/${pdfName}`);

    const page = await browser.newPage();
    // Collect same-origin asset failures so missing CSS/fonts/PDFs fail hard.
    const failures = [];
    page.on('response', (response) => {
      const url = response.url();
      if (url.startsWith(origin) && response.status() >= 400) {
        failures.push(`${response.status()} ${url}`);
      }
    });
    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.startsWith(origin)) failures.push(`failed ${url} (${request.failure()?.errorText})`);
    });

    try {
      const response = await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 });
      if (!response || !response.ok()) {
        throw new Error(`page did not load (status ${response ? response.status() : 'none'})`);
      }

      // Render under print media so the verification reflects the PDF output.
      await page.emulateMedia({ media: 'print' });

      // Deterministic wait: no arbitrary sleeps.
      await page.evaluate(() => document.fonts.ready);

      const probe = await page.evaluate((selectors) => {
        const missing = selectors.filter((s) => !document.querySelector(s));
        const entryCount = document.querySelectorAll('.entry').length;
        const skillCount = document.querySelectorAll('#skills .skill').length;
        const entry = document.querySelector('.entry');
        const entryDisplay = entry ? getComputedStyle(entry).display : null;
        // FontAwesome is a local, required font (drives the section icons).
        const faLoaded = document.fonts.check('16px "FontAwesome"');
        const sheetCount = document.styleSheets.length;
        return { missing, entryCount, skillCount, entryDisplay, faLoaded, sheetCount };
      }, REQUIRED_SELECTORS);

      if (probe.missing.length > 0) {
        throw new Error(`missing required page sections: ${probe.missing.join(', ')}`);
      }
      if (probe.entryCount === 0) throw new Error('no education/experience entries rendered');
      if (probe.skillCount === 0) throw new Error('no skills rendered');
      // A CSS-grid entry proves the stylesheet was applied, not just linked.
      if (probe.entryDisplay !== 'grid' || probe.sheetCount === 0) {
        throw new Error(`stylesheet not applied (entry display="${probe.entryDisplay}", sheets=${probe.sheetCount})`);
      }
      if (!probe.faLoaded) {
        throw new Error('required FontAwesome icon font failed to load');
      }
      if (failures.length > 0) {
        throw new Error(`required assets failed to load:\n    - ${failures.join('\n    - ')}`);
      }

      await page.pdf({
        path: outPath,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        tagged: true,
        outline: true,
      });
    } finally {
      await page.close();
    }

    // Confirm a non-empty, valid PDF landed on disk.
    const { size } = await stat(outPath);
    if (size === 0 || !isPdf(outPath)) {
      throw new Error(`generated file dist/${pdfName} is not a valid PDF`);
    }
    log(`[${lang}] wrote dist/${pdfName} (${(size / 1024).toFixed(1)} KB)`);
  }
}

generate().then(
  () => log('PDF generation complete.'),
  (error) => {
    console.error(`✖ PDF generation failed: ${error.message}`);
    process.exit(1);
  }
);
