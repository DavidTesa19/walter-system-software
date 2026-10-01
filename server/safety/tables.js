// Which tables the safety system covers, and how it names them.
//
// The change log covers every table by default and lists the exceptions, so a
// table added later is protected without anyone remembering to opt it in.

// The safety machinery's own tables.
export const SAFETY_TABLES = new Set([
  'audit_log',
  'audit_blobs',
  'backups',
  'backup_files',
  'backup_file_refs',
  'safety_settings',
]);

// Not recorded in the change log: high-volume telemetry, per-user UI state and
// counters. They are still in every backup. safety_settings IS logged, so the
// log shows who switched the AI agent off or on.
export const AUDIT_EXCLUDED_TABLES = new Set([
  'audit_log',
  'audit_blobs',
  'backups',
  'backup_files',
  'backup_file_refs',
  'analytics_events',
  'chat_read_status',
  'chat_message_reactions',
  'conversations',
  'entity_counters',
  'color_palettes',
  'user_palettes',
]);

// Never inside a backup archive: the log and the backups themselves.
export const BACKUP_EXCLUDED_TABLES = new Set([
  'audit_log',
  'audit_blobs',
  'backups',
  'backup_files',
  'backup_file_refs',
]);

// One top-level statement may not delete more rows than this from a guarded
// table. Cascades (a subject taking its commissions with it) are exempt — the
// guard only looks at statements a person or program issued directly.
export const MASS_DELETE_LIMIT = 20;

// Deleting a folder of documents or a whole chat room legitimately removes
// many rows in one statement.
export const MASS_DELETE_UNGUARDED_TABLES = new Set([
  'documents',
  'chat_rooms',
  'chat_messages',
  'safety_settings',
]);

// Tables the AI agent can never write to, whatever the settings say.
export const AGENT_FORBIDDEN_TABLES = [
  'users',
  'safety_settings',
  'color_palettes',
  'user_palettes',
  ...SAFETY_TABLES,
];

// What the agent's read-only database login may SELECT. Subjects, commissions
// and the catalogs — not users, private chats, calendars or the log.
const AGENT_READABLE_EXTRA = new Set([
  'partners',
  'clients',
  'tipers',
  'notes',
  'future_functions',
  'field_options',
  'field_specialization_options',
  'employees',
]);

export const isAgentReadableTable = (table) =>
  /_(entities|commissions)$/.test(table) || AGENT_READABLE_EXTRA.has(table);

// Bookkeeping columns: a write that only touches these is not a change worth
// logging, and they are never part of a revert. created_by_user_id is stamped
// by a follow-up UPDATE right after every insert (db.js applyCreateActor).
export const IGNORED_CHANGE_FIELDS = ['updated_at', 'field_activity', 'updated_by_user_id', 'created_by_user_id'];

// Stored in place of a password hash, which never enters the log.
export const REDACTED_VALUE = '[skryto]';

export const isSafeIdentifier = (value) => typeof value === 'string' && /^[a-z_][a-z0-9_]{0,62}$/.test(value);

// Column names are not all lowercase (future_functions."completedAt"), so they
// are quoted rather than filtered. Only names read from the catalog get here.
export const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

// ---------------------------------------------------------------------------
// Restore groups — what an admin picks from when restoring a backup.
// ---------------------------------------------------------------------------

const SUBJECT_EXTRA_TABLES = new Set([
  'partners',
  'clients',
  'tipers',
  'entity_counters',
  'project_entity_counters',
  'growth_entity_counters',
]);

export const RESTORE_GROUPS = [
  {
    id: 'subjects',
    label: 'Subjekty a zakázky',
    description: 'Klienti, partneři, tipaři a jejich zakázky ve všech sekcích',
    defaultSelected: true,
    match: (table) => /_(entities|commissions)$/.test(table) || SUBJECT_EXTRA_TABLES.has(table),
  },
  { id: 'documents', label: 'Dokumenty', description: 'Nahrané soubory a složky', defaultSelected: true, match: (t) => t === 'documents' },
  { id: 'notes', label: 'Poznámky', description: 'Poznámky u subjektů a zakázek', defaultSelected: true, match: (t) => t === 'notes' },
  {
    id: 'catalogs',
    label: 'Číselníky oborů',
    description: 'Vlastní obory a zaměření',
    defaultSelected: true,
    match: (t) => t === 'field_options' || t === 'field_specialization_options',
  },
  {
    id: 'future_functions',
    label: 'Budoucí funkce',
    description: 'Seznam plánovaných funkcí',
    defaultSelected: true,
    match: (t) => t === 'future_functions' || t === 'futureFunctions',
  },
  {
    id: 'calendar',
    label: 'Kalendář',
    description: 'Události v kalendáři',
    defaultSelected: true,
    match: (t) => t === 'calendar_events' || t === 'calendarEvents',
  },
  { id: 'chat', label: 'Týmový chat', description: 'Místnosti a zprávy', defaultSelected: true, match: (t) => t.startsWith('chat_') },
  {
    id: 'users',
    label: 'Uživatelé',
    description: 'Účty a jejich motivy. Obnova účty jen doplní nebo vrátí, žádný nesmaže.',
    defaultSelected: false,
    match: (t) => t === 'users' || t === 'user_palettes',
  },
  {
    id: 'other',
    label: 'Ostatní',
    description: 'Analytika, konverzace s AI, motivy, nastavení',
    defaultSelected: false,
    match: () => true,
  },
];

export const restoreGroupOf = (table) => RESTORE_GROUPS.find((group) => group.match(table))?.id ?? 'other';

export const publicRestoreGroups = () =>
  RESTORE_GROUPS.map(({ id, label, description, defaultSelected }) => ({ id, label, description, defaultSelected }));

// ---------------------------------------------------------------------------
// Czech names for tables and records, used by the change log and the trash.
// ---------------------------------------------------------------------------

const ROLE_LABELS = { client: 'Klient', partner: 'Partner', tiper: 'Tipař' };
const SECTION_LABELS = { '': 'Veřejné', project: 'Neveřejné', growth: 'Growth Club' };

const STATIC_TABLE_LABELS = {
  partners: 'Partner (původní tabulka)',
  clients: 'Klient (původní tabulka)',
  tipers: 'Tipař (původní tabulka)',
  users: 'Uživatel',
  employees: 'Zaměstnanec',
  future_functions: 'Budoucí funkce',
  futureFunctions: 'Budoucí funkce',
  documents: 'Dokument',
  notes: 'Poznámka',
  chat_rooms: 'Chatovací místnost',
  chat_messages: 'Zpráva v chatu',
  calendar_events: 'Událost v kalendáři',
  calendarEvents: 'Událost v kalendáři',
  field_options: 'Obor (číselník)',
  field_specialization_options: 'Zaměření (číselník)',
  safety_settings: 'Nastavení bezpečnosti',
};

export function tableLabel(table) {
  if (STATIC_TABLE_LABELS[table]) return STATIC_TABLE_LABELS[table];
  const match = /^(?:(project|growth)_)?(client|partner|tiper)_(entities|commissions)$/.exec(table);
  if (match) {
    const [, section = '', role, kind] = match;
    const noun = kind === 'entities' ? ROLE_LABELS[role] : `Zakázka (${ROLE_LABELS[role].toLowerCase()})`;
    return `${noun} · ${SECTION_LABELS[section]}`;
  }
  return table;
}

export const tableKind = (table) => {
  if (/_entities$/.test(table)) return 'subject';
  if (/_commissions$/.test(table)) return 'commission';
  return table;
};

const text = (value) => (value == null ? '' : String(value).trim());

const truncate = (value, max = 80) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const SETTING_LABELS = {
  ai_writes_enabled: 'Zápisy AI agenta',
  ai_allow_hard_delete: 'AI agent smí mazat',
  ai_max_rows_per_run: 'Limit změn AI agenta za běh',
};

// A short human name for one row — what the change log shows as "which record".
export function describeRow(table, row) {
  if (!row || typeof row !== 'object') return null;

  if (table === 'safety_settings') return SETTING_LABELS[row.key] ?? text(row.key);

  if (/_entities$/.test(table)) {
    const person = [text(row.first_name), text(row.last_name)].filter(Boolean).join(' ');
    const name = text(row.company_name) || person;
    const code = text(row.entity_id);
    return truncate([code, name].filter(Boolean).join(' · ') || `#${row.id}`);
  }

  if (/_commissions$/.test(table)) {
    const code = text(row.commission_id);
    const name = text(row.project_name) || text(row.position) || text(row.service_position) || text(row.field);
    return truncate([code, name].filter(Boolean).join(' · ') || `#${row.id}`);
  }

  const candidates = [row.name, row.company_name, row.title, row.filename, row.username, row.value, row.key, row.content];
  const first = candidates.map(text).find(Boolean);
  if (first) return truncate(first);
  return row.id != null ? `#${row.id}` : null;
}
