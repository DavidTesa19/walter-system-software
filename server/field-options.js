import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VALID_FIELD_OPTION_SCOPES = new Set(['standard', 'project', 'growth']);
export const REMOVED_FIELD_OPTION_LABEL = 'Odstraněno';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STANDARD_FIELD_OPTIONS_FILE = path.resolve(__dirname, '../public-form/field-options.json');

const PROJECT_FIXED_FIELD_OPTION_VALUES = [
  'Banky',
  'Developeři',
  'Firmy',
  'Fondy',
  'Instituce',
  'Investoři',
  'Ostatní',
];

const FIELD_OPTION_REPLACEMENT_TABLES = {
  standard: [
    'partners',
    'clients',
    'tipers',
    'partner_entities',
    'partner_commissions',
    'client_entities',
    'client_commissions',
    'tiper_entities',
    'tiper_commissions',
  ],
  project: [
    'project_partner_entities',
    'project_partner_commissions',
    'project_client_entities',
    'project_client_commissions',
    'project_tiper_entities',
    'project_tiper_commissions',
  ],
  growth: [
    'growth_partner_entities',
    'growth_partner_commissions',
    'growth_client_entities',
    'growth_client_commissions',
    'growth_tiper_entities',
    'growth_tiper_commissions',
  ],
};

const normalizeComparisonValue = (value) => value.trim().toLocaleLowerCase('cs');

const loadStandardFieldOptionValues = () => {
  try {
    const raw = fs.readFileSync(STANDARD_FIELD_OPTIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((group) => (
      Array.isArray(group?.options)
        ? group.options.filter((option) => typeof option === 'string' && option.trim())
        : []
    ));
  } catch (error) {
    console.error('Failed to load standard field options:', error);
    return [];
  }
};

const FIXED_FIELD_OPTION_VALUES_BY_SCOPE = {
  standard: loadStandardFieldOptionValues(),
  project: PROJECT_FIXED_FIELD_OPTION_VALUES,
  growth: loadStandardFieldOptionValues(),
};

export const normalizeFieldOptionScope = (scope) => (
  VALID_FIELD_OPTION_SCOPES.has(scope) ? scope : null
);

export const normalizeFieldOptionValue = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const getFixedFieldOptionValues = (scope) => {
  const normalizedScope = normalizeFieldOptionScope(scope);
  return normalizedScope ? [...(FIXED_FIELD_OPTION_VALUES_BY_SCOPE[normalizedScope] ?? [])] : [];
};

export const hasFixedFieldOptionValue = (scope, value) => {
  const normalizedScope = normalizeFieldOptionScope(scope);
  const normalizedValue = normalizeFieldOptionValue(value);
  if (!normalizedScope || !normalizedValue) {
    return false;
  }

  const comparisonValue = normalizeComparisonValue(normalizedValue);
  return getFixedFieldOptionValues(normalizedScope).some(
    (entry) => normalizeComparisonValue(entry) === comparisonValue
  );
};

export const hasDuplicateFieldOptionValue = (entries, value) => {
  const normalizedValue = normalizeFieldOptionValue(value);
  if (!normalizedValue) {
    return false;
  }

  const comparisonValue = normalizeComparisonValue(normalizedValue);
  return entries.some((entry) => normalizeComparisonValue(String(entry?.value ?? '')) === comparisonValue);
};

export const getFieldOptionReplacementTables = (scope) => {
  const normalizedScope = normalizeFieldOptionScope(scope);
  return normalizedScope ? [...(FIELD_OPTION_REPLACEMENT_TABLES[normalizedScope] ?? [])] : [];
};
