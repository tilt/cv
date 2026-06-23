import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadAllLanguages, validateData, LANGUAGES } from './data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

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
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log(`✓ Data valid for ${LANGUAGES.length} languages (${LANGUAGES.join(', ')}).`);
