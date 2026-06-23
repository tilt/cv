import { writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';
import { LANGUAGES, VARIANTS, loadAllLanguages, validateData } from './data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

const variant = process.argv.includes('--variant')
  ? process.argv[process.argv.indexOf('--variant') + 1]
  : 'full';

if (!VARIANTS.includes(variant)) {
  console.error(`✖ Unknown variant "${variant}" (allowed: ${VARIANTS.join(', ')})`);
  process.exit(1);
}

const basePath = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.BASE_PATH || '').replace(/\/+$/, '');

const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(resolve(root, 'templates')),
  { autoescape: false, trimBlocks: true, lstripBlocks: true }
);

// Load every language up front and validate before rendering anything, so a
// data problem fails the build with a clear, file-scoped message.
let byLang;
try {
  byLang = loadAllLanguages(root);
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exit(1);
}
const errors = validateData(byLang);
if (errors.length > 0) {
  console.error(`✖ Data validation failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

for (const lang of LANGUAGES) {
  const data = byLang[lang];

  data.basePath = basePath;
  data.lang_switcher.url = basePath + data.lang_switcher.url;

  if (variant !== 'full') {
    data.education = data.education.filter(e => e.variants?.includes(variant));
    data.experience = data.experience.filter(e => e.variants?.includes(variant));
  }

  const template = existsSync(resolve(root, 'templates', `${variant}.njk`))
    ? `${variant}.njk`
    : 'full.njk';
  const html = env.render(template, data);
  const outDir = lang === 'en' ? dist : resolve(dist, lang);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'index.html'), html);
}

mkdirSync(resolve(dist, 'assets', 'fonts'), { recursive: true });
cpSync(resolve(root, 'assets', 'fonts'), resolve(dist, 'assets', 'fonts'), { recursive: true });

// Static source assets only. The CV PDFs are produced by src/generate-pdf.mjs
// from the built HTML and must not be copied from the repository root.
const staticFiles = ['thesis.pdf', '.nojekyll'];
for (const file of staticFiles) {
  const src = resolve(root, file);
  if (existsSync(src)) {
    cpSync(src, resolve(dist, file));
  }
}

console.log(`Built ${LANGUAGES.length} languages (variant: ${variant}) → dist/`);
