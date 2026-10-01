import type { Actor, ChangeOp } from './safetyApi';

// Same names the grids and the profile panel use for these columns.
const FIELD_LABELS: Record<string, string> = {
  id: 'ID',
  entity_id: 'Kód subjektu',
  entity_code: 'Kód subjektu',
  commission_id: 'Kód zakázky',
  company_name: 'Společnost',
  first_name: 'Jméno',
  last_name: 'Příjmení',
  name: 'Název',
  email: 'E-mail',
  phone: 'Telefon',
  mobile: 'Telefon',
  website: 'Web',
  field: 'Obor',
  field_specialization: 'Zaměření',
  company_structure: 'Společnost → Obor → Zaměření',
  region: 'Kraj',
  region_structure: 'Kraj → Lokalita',
  location: 'Lokalita',
  location_geo: 'Souřadnice lokality',
  info: 'Popis / Info',
  notes: 'Poznámky',
  category: 'Kategorie',
  status: 'Stav',
  stage: 'Fáze',
  state: 'Stav',
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
  assigned_user_ids: 'Přiřazení uživatelé',
  link_id: 'Propojení mezi sekcemi',
  deal_id: 'Propojení zakázky',
  subject_id: 'Propojení rolí subjektu',
  created_at: 'Vytvořeno',
  updated_at: 'Upraveno',
  created_by_user_id: 'Vytvořil (ID)',
  updated_by_user_id: 'Upravil (ID)',
  username: 'Uživatelské jméno',
  password_hash: 'Heslo',
  role: 'Role',
  access_scope: 'Přístup',
  notification_email: 'Notifikační e-mail',
  filename: 'Název souboru',
  mime_type: 'Typ souboru',
  size_bytes: 'Velikost',
  parent_id: 'Složka',
  archived_at: 'Archivováno',
  label_color: 'Barva štítku',
  content: 'Text',
  author: 'Autor',
  title: 'Název',
  start: 'Začátek',
  end: 'Konec',
  description: 'Popis',
  value: 'Hodnota',
  key: 'Klíč',
  scope: 'Sekce',
  field_value: 'Obor',
  completedAt: 'Dokončeno',
  complexity: 'Složitost',
  phase: 'Fáze',
};

export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export const formatRelative = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return '—';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'právě teď';
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `před ${days} d`;
  return formatDateTime(value);
};

export const formatBytes = (bytes: number | null | undefined) => {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ano' : 'Ne';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map((item) => formatValue(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  if (ISO_DATE.test(text)) return formatDateTime(text);
  return text;
};

export const actorLabel = (actor: Actor) => {
  switch (actor.type) {
    case 'ai_agent':
      return actor.name ? `AI agent (za ${actor.name})` : 'AI agent';
    case 'public':
      return 'Veřejný formulář';
    case 'system':
      return 'Systém';
    default:
      return actor.name ?? `Uživatel #${actor.userId ?? '?'}`;
  }
};

export const pluralRecords = (count: number) =>
  `${count} ${count === 1 ? 'záznam' : count >= 2 && count <= 4 ? 'záznamy' : 'záznamů'}`;

export const OP_LABELS: Record<ChangeOp, string> = {
  I: 'Vytvořeno',
  U: 'Upraveno',
  D: 'Smazáno',
};

// Values the change log keeps but nobody wants to read through.
export const NOISY_FIELDS = new Set(['field_activity', 'updated_at', 'updated_by_user_id', 'created_by_user_id', 'location_geo']);
