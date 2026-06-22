import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { load as yamlLoad } from 'js-yaml';
import nunjucks from 'nunjucks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

const variant = process.argv.includes('--variant')
  ? process.argv[process.argv.indexOf('--variant') + 1]
  : 'full';

const basePath = (process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : process.env.BASE_PATH || '').replace(/\/+$/, '');

const env = new nunjucks.Environment(
  new nunjucks.FileSystemLoader(resolve(root, 'templates')),
  { autoescape: false, trimBlocks: true, lstripBlocks: true }
);

const languages = ['en', 'de'];

for (const lang of languages) {
  const raw = readFileSync(resolve(root, 'data', `cv.${lang}.yaml`), 'utf8');
  const data = yamlLoad(raw);

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

const staticFiles = ['thesis.pdf', 'lebenslauf_till_breuer.pdf', 'lebenslauf_till_breuer_de.pdf', '.nojekyll'];
for (const file of staticFiles) {
  const src = resolve(root, file);
  if (existsSync(src)) {
    cpSync(src, resolve(dist, file));
  }
}

console.log(`Built ${languages.length} languages (variant: ${variant}) → dist/`);
