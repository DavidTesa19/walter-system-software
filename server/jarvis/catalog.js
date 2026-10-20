// Jarvis's map of the app: which sections and roles exist, which API endpoints
// serve them, which of them a user may see, and how to present a record.
//
// Jarvis reads and (later) writes through the app's own HTTP API rather than
// the database, so every access check and every piece of business logic that
// runs for a person also runs for the agent. This file only translates
// between the agent's vocabulary and those endpoints.

export const SECTIONS = ['public', 'projects', 'growth'];
export const ROLES = ['client', 'partner', 'tiper'];
export const KINDS = ['subject', 'commission'];
export const STATUSES = ['accepted', 'pending', 'archived'];

export const SECTION_LABELS = { public: 'Veřejné', projects: 'Neveřejné', growth: 'Growth Club' };
export const ROLE_LABELS = { client: 'Klient', partner: 'Partner', tiper: 'Tipař' };
export const STATUS_LABELS = { accepted: 'Aktivní', pending: 'Ke schválení', archived: 'Archiv' };

// Which sections a user's access scope opens (the same rule as
// requireAccessScope on the server and isViewAllowedForScope on the client).
export function sectionsForScope(accessScope) {
  switch (accessScope) {
    case 'standard':
      return ['public'];
    case 'projects':
      return ['projects'];
    case 'growth':
      return ['growth'];
    default:
      return [...SECTIONS];
  }
}

const sectionPrefix = (section) => (section === 'public' ? '/api' : `/api/${section}`);

export const entitiesPath = (section, role) => `${sectionPrefix(section)}/${role}-entities`;
export const commissionsPath = (section, role) => `${sectionPrefix(section)}/${role}-commissions`;

// Notes and documents hang off the subject, under these resource names.
export const documentResource = (section, role) =>
  section === 'public' ? `${role}s` : `${section === 'projects' ? 'project' : 'growth'}-${role}s`;

export const recordRef = ({ section, role, kind, id }) => `${section}/${role}/${kind}/${id}`;

// ---------------------------------------------------------------------------
// Presenting records to the model: Czech labels, multi-value fields unpacked,
// bookkeeping dropped. Kept compact — every token of a tool result is re-read
// on every later turn of the conversation.
// ---------------------------------------------------------------------------

export const FIELD_LABELS = {
  entity_id: 'Kód subjektu',
  entity_code: 'Kód subjektu',
  commission_id: 'Kód zakázky',
  company_name: 'Společnost',
  first_name: 'Jméno',
  last_name: 'Příjmení',
  email: 'E-mail',
  phone: 'Telefon',
  website: 'Web',
  ico: 'IČO',
  field: 'Obor',
  field_specialization: 'Zaměření',
  region: 'Kraj',
  location: 'Lokalita',
  info: 'Popis / Info',
  notes: 'Poznámky',
  category: 'Kategorie',
  status: 'Schválení',
  state: 'Stav zakázky',
  tier: 'Úroveň',
  service: 'Požadovaná služba',
  service_position: 'Typ služby',
  budget: 'Rozpočet',
  project_name: 'Projekt',
  position: 'Zakázka',
  deadline: 'Termín',
  priority: 'Priorita',
  commission_value: 'Provize',
  is_tipped: 'Tipnuto',
  assigned_to: 'Odpovědná osoba',
  assigned_users: 'Přiřazení uživatelé',
  created_at: 'Vytvořeno',
  updated_at: 'Upraveno',
};

// Fields the model never needs: internal ids, map coordinates, change markers,
// and the JSON trees whose flat mirrors (field, region, location) it does get.
const HIDDEN_FIELDS = new Set([
  'id',
  'field_activity',
  'location_geo',
  'company_structure',
  'region_structure',
  'link_id',
  'deal_id',
  'subject_id',
  'assigned_user_ids',
  'created_by_user_id',
  'updated_by_user_id',
]);

// Obor / Kraj / Lokalita can hold several values as a JSON array string.
export function unpackValue(value) {
  if (typeof value === 'string' && value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean).join(', ');
    } catch {
      // Not JSON after all — keep the text.
    }
  }
  if (typeof value === 'string' && value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed)
          .map(([key, inner]) => `${key}: ${Array.isArray(inner) ? inner.join(', ') : inner}`)
          .join('; ');
      }
    } catch {
      // Keep the text.
    }
  }
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'boolean') return value ? 'ano' : 'ne';
  return value;
}

const isBlank = (value) => value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

export const truncate = (text, max) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

export function personName(row) {
  return [row.first_name ?? row.entity_first_name, row.last_name ?? row.entity_last_name]
    .filter((part) => part && String(part).trim())
    .join(' ')
    .trim();
}

export function subjectName(row) {
  const company = String(row.company_name ?? row.entity_company_name ?? '').trim();
  return company || personName(row) || row.entity_id || row.entity_code || `#${row.id}`;
}

export function commissionName(row) {
  return String(row.project_name || row.position || row.service_position || row.field || '').trim() || row.commission_id;
}

// Every non-empty, non-internal field of a record, with Czech labels. On a
// commission `entity_id` is the parent's numeric id (its code is entity_code),
// and the entity_* columns are the parent's fields, described separately.
export function describeFields(row, { kind = 'subject', teamById, maxText = 400 } = {}) {
  const out = {};
  for (const [key, raw] of Object.entries(row ?? {})) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (kind === 'commission' && key.startsWith('entity_') && key !== 'entity_code') continue;
    const value = key === 'status' ? STATUS_LABELS[raw] ?? raw : unpackValue(raw);
    if (isBlank(value)) continue;
    out[FIELD_LABELS[key] ?? key] = typeof value === 'string' ? truncate(value, maxText) : value;
  }
  const assigned = assignedNames(row, teamById);
  if (assigned) out[FIELD_LABELS.assigned_users] = assigned;
  return out;
}

export function assignedNames(row, teamById) {
  const ids = Array.isArray(row?.assigned_user_ids) ? row.assigned_user_ids : [];
  if (!ids.length || !teamById) return null;
  return ids.map((id) => teamById.get(Number(id))?.username ?? `#${id}`).join(', ');
}

// Text a search runs over, without diacritics and case.
export const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function searchableText(row, teamById) {
  const parts = [];
  for (const [key, raw] of Object.entries(row ?? {})) {
    if (key === 'field_activity' || key === 'location_geo' || key.endsWith('_at')) continue;
    const value = unpackValue(raw);
    if (!isBlank(value)) parts.push(String(value));
  }
  const assigned = assignedNames(row, teamById);
  if (assigned) parts.push(assigned);
  return normalizeText(parts.join(' \u0001 '));
}
