// The data quality report (Analýza › Kvalita dat): checks over the subjects
// and zakázky of the sections a user can open. Pure functions over the rows
// the section APIs return, so the report works on both servers and the
// rules can be tested on their own.

import { isValidIco } from '../usersGrid/ico';
import { parseMultiValue } from '../usersGrid/multiValue';

export type Section = 'public' | 'projects' | 'growth';
export type Role = 'client' | 'partner' | 'tiper';

export const SECTION_LABELS: Record<Section, string> = { public: 'Veřejné', projects: 'Neveřejné', growth: 'Growth Club' };
export const ROLE_LABELS: Record<Role, string> = { client: 'Klient', partner: 'Partner', tiper: 'Tipař' };

/** A record the report can open (the same shape Jarvis's open buttons use). */
export interface RecordRef {
  section: Section;
  role: Role;
  kind: 'subject' | 'commission';
  id: number;
  entityId: number;
  status: string;
  label: string;
}

export interface Finding {
  key: string;
  /** What is wrong with these records, in a few words. */
  detail: string;
  records: RecordRef[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface Check {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  findings: Finding[];
}

type Row = Record<string, unknown>;

export interface SectionData {
  section: Section;
  role: Role;
  subjects: Row[];
  commissions: Row[];
}

// Zakázky in these states need no deadline and are never late.
const CLOSED_STATES = new Set(['Uzavřeno', 'Zrušeno', 'Odloženo']);
const ACTIVE_STATES = new Set(['Probíhá', 'Aktuální', 'Plánováno', 'Před podepsáním']);
const PENDING_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim());
const firstOf = (value: unknown) => parseMultiValue(value)[0] ?? text(value);
const digits = (value: unknown) => text(value).replace(/\D/g, '');

// Lower case, no diacritics, no punctuation and no legal form at the end:
// "Pekárna Novák, s.r.o." and "pekarna novak sro" are the same company, and
// "AS Group a.s." stays "as group".
const LEGAL_FORM = /[\s,]*(spol\.?\s*s\s*r\.?\s*o\.?|s\.?\s*r\.?\s*o\.?|a\.?\s*s\.?|v\.?\s*o\.?\s*s\.?|k\.?\s*s\.?|z\.?\s*s\.?|o\.?\s*p\.?\s*s\.?)\s*$/;
export const companyKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(LEGAL_FORM, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Values left as the old "new row" defaults ("Nová Společnost", "Nový
// Klient", a phone of zeros): the row was created and never filled in.
const PLACEHOLDER_COMPANY = /^nov[áa] spole[čc]nost$/i;
const PLACEHOLDER_PERSON = /^nov[ýy] (klient|partner|tipa[řr])$/i;

function subjectLabel(row: Row) {
  const company = firstOf(row.company_name);
  const person = [text(row.first_name), text(row.last_name)].filter(Boolean).join(' ');
  return [text(row.entity_id), company || person || 'bez jména'].filter(Boolean).join(' · ');
}

function subjectRef(data: SectionData, row: Row): RecordRef {
  return {
    section: data.section,
    role: data.role,
    kind: 'subject',
    id: Number(row.id),
    entityId: Number(row.id),
    status: text(row.status) || 'accepted',
    label: subjectLabel(row),
  };
}

function commissionRef(data: SectionData, row: Row): RecordRef {
  const title = text(row.position) || text(row.service);
  return {
    section: data.section,
    role: data.role,
    kind: 'commission',
    id: Number(row.id),
    entityId: Number(row.entity_id),
    status: text(row.status) || 'accepted',
    label: [text(row.commission_id), title].filter(Boolean).join(' · ') || `Zakázka ${row.id}`,
  };
}

const startOfToday = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

export function analyse(data: SectionData[], now = new Date()): Check[] {
  const checks: Record<string, Check> = {
    duplicates: {
      id: 'duplicates',
      title: 'Možné duplicity',
      description: 'Subjekty v téže sekci a roli se stejným IČO, telefonem, e-mailem nebo názvem firmy. Zkontrolujte, jestli nejde o jeden subjekt zadaný dvakrát.',
      severity: 'warning',
      findings: [],
    },
    invalidIco: {
      id: 'invalidIco',
      title: 'Neplatné IČO',
      description: 'IČO, kterému nesedí kontrolní číslice. Takové číslo žádná firma nemá: jde o překlep.',
      severity: 'error',
      findings: [],
    },
    noName: {
      id: 'noName',
      title: 'Bez jména i firmy',
      description: 'Subjekt nemá vyplněný název firmy ani jméno osoby.',
      severity: 'error',
      findings: [],
    },
    placeholder: {
      id: 'placeholder',
      title: 'Nevyplněné výchozí hodnoty',
      description: 'Řádek má pořád výchozí hodnoty nového záznamu („Nová Společnost“, „Nový Klient“, telefon z nul). Doplňte je, nebo záznam archivujte.',
      severity: 'warning',
      findings: [],
    },
    noContact: {
      id: 'noContact',
      title: 'Bez kontaktu',
      description: 'Subjekt nemá telefon ani e-mail.',
      severity: 'warning',
      findings: [],
    },
    pendingLong: {
      id: 'pendingLong',
      title: `Čeká na schválení déle než ${PENDING_DAYS} dní`,
      description: 'Subjekty ke schválení, které nikdo neschválil ani nezamítl.',
      severity: 'info',
      findings: [],
    },
    overdue: {
      id: 'overdue',
      title: 'Zakázky po termínu',
      description: 'Termín uplynul a zakázka není uzavřená, zrušená ani odložená.',
      severity: 'error',
      findings: [],
    },
    unassigned: {
      id: 'unassigned',
      title: 'Zakázky bez odpovědné osoby',
      description: 'Otevřená zakázka, kterou nemá nikdo přiřazenou.',
      severity: 'warning',
      findings: [],
    },
    noDeadline: {
      id: 'noDeadline',
      title: 'Rozpracované zakázky bez termínu',
      description: 'Zakázka probíhá nebo je naplánovaná, ale nemá termín.',
      severity: 'info',
      findings: [],
    },
  };

  const today = startOfToday(now);

  for (const block of data) {
    const subjects = block.subjects.filter((row) => text(row.status) !== 'archived');
    const groupLabel = `${SECTION_LABELS[block.section]} · ${ROLE_LABELS[block.role]}`;

    // Duplicates within one section and role (the same subject in another role
    // or section is a link, not a duplicate).
    const groups = new Map<string, { detail: string; rows: Row[] }>();
    const addToGroup = (kind: string, value: string, detail: string, row: Row) => {
      if (!value) return;
      const key = `${block.section}|${block.role}|${kind}|${value}`;
      const group = groups.get(key) ?? { detail, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    };

    for (const row of subjects) {
      const ref = subjectRef(block, row);
      const company = firstOf(row.company_name);
      const person = [text(row.first_name), text(row.last_name)].filter(Boolean).join(' ');
      const phoneDigits = digits(row.phone);
      const email = text(row.email).toLowerCase();
      const icoRaw = digits(row.ico);
      const isPlaceholder =
        PLACEHOLDER_COMPANY.test(company) || PLACEHOLDER_PERSON.test(person) || (phoneDigits.length > 0 && /^0+$/.test(phoneDigits));

      if (icoRaw) {
        const ico = icoRaw.padStart(8, '0');
        if (icoRaw.length > 8 || !isValidIco(ico)) {
          checks.invalidIco.findings.push({ key: `ico-${block.section}-${block.role}-${row.id}`, detail: `IČO ${text(row.ico)} · ${groupLabel}`, records: [ref] });
        } else {
          addToGroup('ico', ico, `stejné IČO ${ico}`, row);
        }
      }
      if (!company && !person) {
        checks.noName.findings.push({ key: `name-${block.section}-${block.role}-${row.id}`, detail: groupLabel, records: [ref] });
      }
      if (isPlaceholder) {
        checks.placeholder.findings.push({ key: `placeholder-${block.section}-${block.role}-${row.id}`, detail: groupLabel, records: [ref] });
      }
      if (!phoneDigits && !email) {
        checks.noContact.findings.push({ key: `contact-${block.section}-${block.role}-${row.id}`, detail: groupLabel, records: [ref] });
      }
      if (text(row.status) === 'pending') {
        const created = Date.parse(text(row.created_at));
        if (Number.isFinite(created) && today - created > PENDING_DAYS * DAY_MS) {
          const days = Math.floor((today - created) / DAY_MS);
          checks.pendingLong.findings.push({ key: `pending-${block.section}-${block.role}-${row.id}`, detail: `${days} dní · ${groupLabel}`, records: [ref] });
        }
      }
      // Placeholder values would make every unfilled row a "duplicate".
      if (!isPlaceholder) {
        if (phoneDigits.length >= 9) addToGroup('phone', phoneDigits.slice(-9), `stejný telefon ${text(row.phone)}`, row);
        if (email) addToGroup('email', email, `stejný e-mail ${email}`, row);
        const key = company ? companyKey(company) : '';
        if (key.length >= 3) addToGroup('company', key, `stejný název firmy „${company}“`, row);
      }
    }

    // The same records matched on several things (phone and name, say) are
    // one finding with every reason.
    const byRecords = new Map<string, { rows: Row[]; reasons: string[] }>();
    for (const group of groups.values()) {
      if (group.rows.length < 2) continue;
      const recordsKey = group.rows.map((row) => row.id).sort().join(',');
      const entry = byRecords.get(recordsKey) ?? { rows: group.rows, reasons: [] };
      entry.reasons.push(group.detail);
      byRecords.set(recordsKey, entry);
    }
    for (const [recordsKey, entry] of byRecords) {
      checks.duplicates.findings.push({
        key: `dup-${block.section}-${block.role}-${recordsKey}`,
        detail: `${entry.reasons.join(', ')} · ${groupLabel}`,
        records: entry.rows.map((row) => subjectRef(block, row)),
      });
    }

    for (const row of block.commissions) {
      if (text(row.status) !== 'accepted') continue;
      const state = text(row.state);
      if (CLOSED_STATES.has(state)) continue;
      const ref = commissionRef(block, row);
      const deadline = Date.parse(text(row.deadline));
      const assigned = text(row.assigned_to) || (Array.isArray(row.assigned_user_ids) && row.assigned_user_ids.length > 0);

      if (Number.isFinite(deadline) && deadline < today) {
        const days = Math.ceil((today - deadline) / DAY_MS);
        checks.overdue.findings.push({
          key: `overdue-${block.section}-${block.role}-${row.id}`,
          detail: `${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'} po termínu${state ? ` · ${state}` : ''} · ${groupLabel}`,
          records: [ref],
        });
      }
      if (!assigned) {
        checks.unassigned.findings.push({ key: `unassigned-${block.section}-${block.role}-${row.id}`, detail: `${state || 'bez stavu'} · ${groupLabel}`, records: [ref] });
      }
      if (ACTIVE_STATES.has(state) && !Number.isFinite(deadline)) {
        checks.noDeadline.findings.push({ key: `deadline-${block.section}-${block.role}-${row.id}`, detail: `${state} · ${groupLabel}`, records: [ref] });
      }
    }
  }

  return Object.values(checks);
}
