import { writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';
import { LANGUAGES, VARIANTS, VARIANT_HOME, loadAllLanguages, pdfFileForVariant, validateData } from './data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

const variantIndex = process.argv.indexOf('--variant');
const requestedVariant = variantIndex === -1 ? null : process.argv[variantIndex + 1];

if (variantIndex !== -1 && (!requestedVariant || requestedVariant.startsWith('--'))) {
  console.error(`✖ Missing value for --variant (allowed: ${VARIANTS.join(', ')})`);
  process.exit(1);
}

if (requestedVariant && !VARIANTS.includes(requestedVariant)) {
  console.error(`✖ Unknown variant "${requestedVariant}" (allowed: ${VARIANTS.join(', ')})`);
  process.exit(1);
}

const variantsToBuild = requestedVariant ? [requestedVariant] : VARIANTS;

const basePath = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.BASE_PATH || '').replace(/\/+$/, '');

const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(resolve(root, 'templates')),
  { autoescape: false, trimBlocks: true, lstripBlocks: true }
);

const FONT_FILES = [
  'fontawesome-webfont.woff2',
  'fontawesome-webfont.woff',
  'fontawesome-webfont.ttf',
];

function copyFontAwesomeFonts() {
  const sourceDir = resolve(root, 'node_modules', 'font-awesome', 'fonts');
  const targetDir = resolve(dist, 'assets', 'fonts');

  if (!existsSync(sourceDir)) {
    console.error('✖ FontAwesome fonts are missing. Run "npm install" before building.');
    process.exit(1);
  }

  mkdirSync(targetDir, { recursive: true });
  for (const file of FONT_FILES) {
    const source = resolve(sourceDir, file);
    if (!existsSync(source)) {
      console.error(`✖ FontAwesome font file is missing: ${source}`);
      process.exit(1);
    }
    cpSync(source, resolve(targetDir, file));
  }
}

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

function outputDirFor(lang, variant) {
  const home = VARIANT_HOME[variant][lang];
  const rel = home.replace(/^\/+|\/+$/g, '');
  return rel ? resolve(dist, rel) : dist;
}

function includesVariant(entry, lang, variant) {
  return entry.variants?.includes(variant) || entry.localized_variants?.[lang]?.includes(variant);
}

function dataForVariant(source, lang, variant) {
  const data = structuredClone(source);
  const otherLang = LANGUAGES.find(l => l !== lang);

  data.basePath = basePath;
  data.variant = variant;
  data.pdf_file = pdfFileForVariant(data, variant);
  data.lang_switcher.url = basePath + VARIANT_HOME[variant][otherLang];
  data.show_profession = !(lang === 'de' && variant === 'brief');
  data.variant_switcher = {
    label: variant === 'brief' ? data.variant_switcher.full_label : data.variant_switcher.brief_label,
    url: basePath + VARIANT_HOME[variant === 'brief' ? 'full' : 'brief'][lang],
  };

  if (variant !== 'full') {
    data.education = data.education.filter(e => includesVariant(e, lang, variant));
    data.experience = data.experience.filter(e => includesVariant(e, lang, variant));
  }

  return data;
}

for (const variant of variantsToBuild) {
  const template = existsSync(resolve(root, 'templates', `${variant}.njk`))
    ? `${variant}.njk`
    : 'full.njk';

  for (const lang of LANGUAGES) {
    const data = dataForVariant(byLang[lang], lang, variant);
    const html = env.render(template, data);
    const outDir = outputDirFor(lang, variant);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'index.html'), html);
  }
}

copyFontAwesomeFonts();

// Static source assets only. The CV PDFs are produced by src/generate-pdf.mjs
// from the built HTML and must not be copied from the repository root.
const staticFiles = ['thesis.pdf', '.nojekyll'];
for (const file of staticFiles) {
  const src = resolve(root, file);
  if (existsSync(src)) {
    cpSync(src, resolve(dist, file));
  }
}

console.log(`Built ${LANGUAGES.length} languages (${variantsToBuild.join(', ')} variants) → dist/`);
