import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { load as yamlLoad } from 'js-yaml';

// Supported configuration. Kept here so both the build and the PDF generator
// share a single source of truth.
export const LANGUAGES = ['en', 'de'];
export const VARIANTS = ['full', 'brief'];
export const THEMES = ['classic', 'clean'];

// Canonical on-site path for each language and variant (before any GitHub
// Pages base path). English lives at the root, German under /de/.
export const LANG_HOME = {
  en: '/',
  de: '/de/',
};

export const VARIANT_HOME = {
  full: LANG_HOME,
  brief: {
    en: '/brief/',
    de: '/de/brief/',
  },
};

export function pdfFileForVariant(data, variant) {
  return variant === 'brief' ? data.brief_pdf_file : data.pdf_file;
}

// Sections that make up a single language. metadata.yaml carries the top-level
// scalars/maps; the others each contribute one keyed list.
const SECTION_FILES = [
  'metadata',
  'education',
  'experience',
  'skills',
  'interests',
  'references',
];

// Maps a top-level data field to the section file it is expected to live in,
// so validation errors can name the offending file.
const FIELD_FILE = {
  lang: 'metadata.yaml',
  theme: 'metadata.yaml',
  name: 'metadata.yaml',
  email: 'metadata.yaml',
  meta_description: 'metadata.yaml',
  profession: 'metadata.yaml',
  fonts_url: 'metadata.yaml',
  abstract: 'metadata.yaml',
  brief_profile: 'metadata.yaml',
  contact_links: 'metadata.yaml',
  language_skills: 'metadata.yaml',
  pdf_file: 'metadata.yaml',
  brief_pdf_file: 'metadata.yaml',
  pdf_label: 'metadata.yaml',
  lang_switcher: 'metadata.yaml',
  variant_switcher: 'metadata.yaml',
  sections: 'metadata.yaml',
  icons: 'metadata.yaml',
  footer: 'metadata.yaml',
  education: 'education.yaml',
  experience: 'experience.yaml',
  skills: 'skills.yaml',
  interests: 'interests.yaml',
  references: 'references.yaml',
};

// Inverse of FIELD_FILE: the set of top-level keys each section file may
// contain. Keeps the allow-list in sync with the field→file mapping above.
const SECTION_KEYS = Object.entries(FIELD_FILE).reduce((acc, [field, file]) => {
  const section = file.replace(/\.yaml$/, '');
  (acc[section] ??= new Set()).add(field);
  return acc;
}, {});

/**
 * Load and merge all section files for a single language.
 * Throws if a section file is missing or contains a misplaced top-level key
 * (which would otherwise silently override a field from another file).
 */
export function loadLanguageData(lang, root) {
  const dir = resolve(root, 'data', lang);
  const merged = {};
  for (const section of SECTION_FILES) {
    const file = resolve(dir, `${section}.yaml`);
    if (!existsSync(file)) {
      throw new Error(`[${lang}] missing data file: data/${lang}/${section}.yaml`);
    }
    const content = yamlLoad(readFileSync(file, 'utf8')) || {};
    const allowed = SECTION_KEYS[section];
    for (const key of Object.keys(content)) {
      if (!allowed || !allowed.has(key)) {
        const allow = allowed ? [...allowed].join(', ') : '(none)';
        throw new Error(
          `[${lang}] data/${lang}/${section}.yaml: unexpected top-level key "${key}" (allowed here: ${allow})`
        );
      }
      if (key in merged) {
        throw new Error(`[${lang}] data/${lang}/${section}.yaml: duplicate top-level key "${key}" already set by another section file`);
      }
    }
    Object.assign(merged, content);
  }
  return merged;
}

/** Load every supported language into a { lang: data } map. */
export function loadAllLanguages(root) {
  const byLang = {};
  for (const lang of LANGUAGES) {
    byLang[lang] = loadLanguageData(lang, root);
  }
  return byLang;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const REQUIRED_SCALARS = [
  'lang',
  'theme',
  'name',
  'email',
  'meta_description',
  'profession',
  'fonts_url',
  'abstract',
  'pdf_file',
  'brief_pdf_file',
  'pdf_label',
];

const REQUIRED_SECTION_LABELS = ['education', 'experience', 'skills', 'interests', 'references'];

function locate(lang, field) {
  const file = FIELD_FILE[field];
  return file ? `data/${lang}/${file}` : `data/${lang}`;
}

function checkRequired(errors, lang, data) {
  for (const field of REQUIRED_SCALARS) {
    const value = data[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push(`[${lang}] ${locate(lang, field)}: required field "${field}" is missing or empty`);
    }
  }

  // lang_switcher
  const sw = data.lang_switcher;
  if (!sw || typeof sw !== 'object') {
    errors.push(`[${lang}] ${locate(lang, 'lang_switcher')}: required field "lang_switcher" is missing`);
  } else {
    for (const key of ['label', 'flag']) {
      if (!sw[key]) {
        errors.push(`[${lang}] ${locate(lang, 'lang_switcher')}: "lang_switcher.${key}" is missing`);
      }
    }
  }

  const vs = data.variant_switcher;
  if (!vs || typeof vs !== 'object') {
    errors.push(`[${lang}] ${locate(lang, 'variant_switcher')}: required field "variant_switcher" is missing`);
  } else {
    for (const key of ['full_label', 'brief_label']) {
      if (!vs[key]) {
        errors.push(`[${lang}] ${locate(lang, 'variant_switcher')}: "variant_switcher.${key}" is missing`);
      }
    }
  }

  // section labels + icons
  for (const label of REQUIRED_SECTION_LABELS) {
    if (!data.sections || !data.sections[label]) {
      errors.push(`[${lang}] ${locate(lang, 'sections')}: "sections.${label}" heading is missing`);
    }
    if (!data.icons || !data.icons[label]) {
      errors.push(`[${lang}] ${locate(lang, 'icons')}: "icons.${label}" is missing`);
    }
  }

  // footer
  if (!data.footer || !data.footer.theme_credit || !data.footer.download_prompt) {
    errors.push(`[${lang}] ${locate(lang, 'footer')}: "footer.theme_credit" and "footer.download_prompt" are required`);
  }
}

function checkEntries(errors, lang, data, field, requiredFields) {
  const entries = data[field];
  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push(`[${lang}] ${locate(lang, field)}: "${field}" must be a non-empty list`);
    return;
  }
  const seenIds = new Set();
  entries.forEach((entry, index) => {
    const where = `[${lang}] ${locate(lang, field)}: ${field}[${index}]`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${where} is not a mapping`);
      return;
    }
    for (const rf of requiredFields) {
      const value = entry[rf];
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push(`${where} (id="${entry.id ?? '?'}"): required field "${rf}" is missing or empty`);
      }
    }
    if (entry.id) {
      if (seenIds.has(entry.id)) {
        errors.push(`${where}: duplicate id "${entry.id}"`);
      }
      seenIds.add(entry.id);
    }
    if (entry.variants !== undefined) {
      if (!Array.isArray(entry.variants) || entry.variants.length === 0) {
        errors.push(`${where} (id="${entry.id ?? '?'}"): "variants" must be a non-empty list`);
      } else {
        for (const v of entry.variants) {
          if (!VARIANTS.includes(v)) {
            errors.push(`${where} (id="${entry.id ?? '?'}"): unknown variant "${v}" (allowed: ${VARIANTS.join(', ')})`);
          }
        }
      }
    }
    if (entry.localized_variants !== undefined) {
      if (!entry.localized_variants || typeof entry.localized_variants !== 'object' || Array.isArray(entry.localized_variants)) {
        errors.push(`${where} (id="${entry.id ?? '?'}"): "localized_variants" must be a language-to-variants mapping`);
      } else {
        for (const [localizedLang, variants] of Object.entries(entry.localized_variants)) {
          if (!LANGUAGES.includes(localizedLang)) {
            errors.push(`${where} (id="${entry.id ?? '?'}"): "localized_variants.${localizedLang}" is not a supported language`);
            continue;
          }
          if (!Array.isArray(variants) || variants.length === 0) {
            errors.push(`${where} (id="${entry.id ?? '?'}"): "localized_variants.${localizedLang}" must be a non-empty list`);
            continue;
          }
          for (const v of variants) {
            if (!VARIANTS.includes(v)) {
              errors.push(`${where} (id="${entry.id ?? '?'}"): unknown localized variant "${v}" (allowed: ${VARIANTS.join(', ')})`);
            }
          }
        }
      }
    }
  });
}

function checkTheme(errors, lang, data) {
  if (data.theme && !THEMES.includes(data.theme)) {
    errors.push(`[${lang}] ${locate(lang, 'theme')}: unknown theme "${data.theme}" (allowed: ${THEMES.join(', ')})`);
  }
}

function checkPdfName(errors, lang, field, file, seenPdf) {
  if (!file) return;
  if (!/^[a-z0-9._-]+\.pdf$/i.test(file)) {
    errors.push(`[${lang}] ${locate(lang, field)}: "${field}" ("${file}") is not a valid PDF filename`);
  }
  if (seenPdf.has(file)) {
    errors.push(`[${lang}] ${locate(lang, field)}: "${field}" ("${file}") is not unique across languages/variants`);
  }
  seenPdf.add(file);
}

function checkPdfFiles(errors, lang, data, seenPdf) {
  checkPdfName(errors, lang, 'pdf_file', data.pdf_file, seenPdf);
  checkPdfName(errors, lang, 'brief_pdf_file', data.brief_pdf_file, seenPdf);
}

function checkSkills(errors, lang, data) {
  const categories = data.skills;
  if (!Array.isArray(categories) || categories.length === 0) {
    errors.push(`[${lang}] ${locate(lang, 'skills')}: "skills" must be a non-empty list of categories`);
    return;
  }

  const seenCategoryIds = new Set();
  categories.forEach((category, categoryIndex) => {
    const where = `[${lang}] ${locate(lang, 'skills')}: skills[${categoryIndex}]`;
    if (!category || typeof category !== 'object') {
      errors.push(`${where} is not a mapping`);
      return;
    }
    for (const field of ['id', 'category']) {
      const value = category[field];
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push(`${where}: required field "${field}" is missing or empty`);
      }
    }
    if (category.id) {
      if (seenCategoryIds.has(category.id)) errors.push(`${where}: duplicate id "${category.id}"`);
      seenCategoryIds.add(category.id);
    }
    if (!Array.isArray(category.items) || category.items.length === 0) {
      errors.push(`${where} (id="${category.id ?? '?'}"): "items" must be a non-empty list`);
      return;
    }

    const seenItemIds = new Set();
    category.items.forEach((item, itemIndex) => {
      const itemWhere = `${where}.items[${itemIndex}]`;
      if (!item || typeof item !== 'object') {
        errors.push(`${itemWhere} is not a mapping`);
        return;
      }
      for (const field of ['id', 'name']) {
        const value = item[field];
        if (value === undefined || value === null || String(value).trim() === '') {
          errors.push(`${itemWhere}: required field "${field}" is missing or empty`);
        }
      }
      if (item.id) {
        if (seenItemIds.has(item.id)) errors.push(`${itemWhere}: duplicate id "${item.id}" in category "${category.id ?? '?'}"`);
        seenItemIds.add(item.id);
      }
      if (item.experience !== undefined && String(item.experience).trim() === '') {
        errors.push(`${itemWhere} (id="${item.id ?? '?'}"): "experience" must not be empty when present`);
      }
    });
  });
}

function checkCrossLanguage(errors, byLang) {
  const langs = Object.keys(byLang);
  if (langs.length < 2) return;
  const [base, ...rest] = langs;

  const idsMatch = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);

  for (const field of ['education', 'experience']) {
    const baseEntries = Array.isArray(byLang[base][field]) ? byLang[base][field] : [];
    const baseIds = baseEntries.map(e => e?.id);
    for (const lang of rest) {
      const entries = Array.isArray(byLang[lang][field]) ? byLang[lang][field] : [];
      const ids = entries.map(e => e?.id);
      if (!idsMatch(ids, baseIds)) {
        errors.push(
          `[${lang}] data/${lang}/${field}.yaml: "${field}" ids/order [${ids.join(', ')}] do not match [${base}] [${baseIds.join(', ')}]`
        );
        continue;
      }
      // Variants must agree per matching id.
      entries.forEach((entry, i) => {
        const a = JSON.stringify(baseEntries[i]?.variants ?? null);
        const b = JSON.stringify(entry?.variants ?? null);
        if (a !== b) {
          errors.push(
            `[${lang}] data/${lang}/${field}.yaml: entry "${entry?.id}" variants ${b} differ from [${base}] ${a}`
          );
        }
      });
    }
  }

  const baseSkillCategories = Array.isArray(byLang[base].skills) ? byLang[base].skills : [];
  const baseCategoryIds = baseSkillCategories.map(c => c?.id);
  for (const lang of rest) {
    const categories = Array.isArray(byLang[lang].skills) ? byLang[lang].skills : [];
    const categoryIds = categories.map(c => c?.id);
    if (!idsMatch(categoryIds, baseCategoryIds)) {
      errors.push(
        `[${lang}] data/${lang}/skills.yaml: category ids/order [${categoryIds.join(', ')}] do not match [${base}] [${baseCategoryIds.join(', ')}]`
      );
      continue;
    }
    categories.forEach((category, i) => {
      const itemIds = Array.isArray(category?.items) ? category.items.map(item => item?.id) : [];
      const baseItemIds = Array.isArray(baseSkillCategories[i]?.items) ? baseSkillCategories[i].items.map(item => item?.id) : [];
      if (!idsMatch(itemIds, baseItemIds)) {
        errors.push(
          `[${lang}] data/${lang}/skills.yaml: category "${category?.id ?? '?'}" item ids/order [${itemIds.join(', ')}] do not match [${base}] [${baseItemIds.join(', ')}]`
        );
      }
    });
  }
}

/**
 * Validate every loaded language. Returns an array of human-readable error
 * strings (empty when the data is valid).
 */
export function validateData(byLang) {
  const errors = [];

  for (const lang of Object.keys(byLang)) {
    if (!LANGUAGES.includes(lang)) {
      errors.push(`[${lang}]: unsupported language (allowed: ${LANGUAGES.join(', ')})`);
    }
  }

  const seenPdf = new Set();
  for (const lang of Object.keys(byLang)) {
    const data = byLang[lang];
    if (data.lang && data.lang !== lang) {
      errors.push(`[${lang}] ${locate(lang, 'lang')}: "lang" field is "${data.lang}" but file lives under data/${lang}/`);
    }
    checkRequired(errors, lang, data);
    checkTheme(errors, lang, data);
    checkPdfFiles(errors, lang, data, seenPdf);
    checkEntries(errors, lang, data, 'education', ['id', 'period', 'school', 'details', 'variants']);
    checkEntries(errors, lang, data, 'experience', ['id', 'period', 'company', 'title', 'description', 'variants']);
    checkSkills(errors, lang, data);
    checkEntries(errors, lang, data, 'references', ['name', 'url', 'relation']);
    if (!Array.isArray(data.interests) || data.interests.length === 0) {
      errors.push(`[${lang}] ${locate(lang, 'interests')}: "interests" must be a non-empty list`);
    }
  }

  checkCrossLanguage(errors, byLang);

  return errors;
}

/**
 * Load all languages and validate. Throws a single aggregated error on failure.
 */
export function loadAndValidate(root) {
  const byLang = loadAllLanguages(root);
  const errors = validateData(byLang);
  if (errors.length > 0) {
    throw new Error(`Data validation failed (${errors.length}):\n  - ${errors.join('\n  - ')}`);
  }
  return byLang;
}
