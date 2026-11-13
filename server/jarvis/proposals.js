// Changes Jarvis proposes and the user confirms.
//
// Jarvis never writes on its own: a propose_* tool checks the change, records
// what each field holds now and what it would become, and shows the user a
// card. Only the user's "Potvrdit" applies it — through this server's own API
// with the agent token, like every Jarvis call, so access checks, linked
// sections and the change log (tagged as the AI agent, one changeset per
// confirmed card) all apply. A field that changed since the card was made is
// not overwritten: the card fails and Jarvis is asked for a fresh one.

import crypto from 'node:crypto';
import { isValidIco, normalizeIco } from '../ares.js';
import { ROLE_LABELS, SECTION_LABELS, commissionsPath, documentResource, entitiesPath, unpackValue } from './catalog.js';
import { companyTreeUpdates, describeObors, readCompanyTree, withObor } from './companyTree.js';

export class ProposalError extends Error {}

const WORKFLOW_STATES = ['Uzavřeno', 'Podepsáno', 'Před podepsáním', 'Probíhá', 'Aktuální', 'Plánováno', 'Odloženo', 'Zrušeno'];
const PRIORITIES = ['Nízká', 'Střední', 'Vysoká', 'Urgentní'];
const TIERS = ['Bronze', 'Silver', 'Gold', 'VIP'];

const pickFrom = (values) => (raw) => {
  const match = values.find((value) => value.toLowerCase() === String(raw).trim().toLowerCase());
  if (!match) throw new ProposalError(`Povolené hodnoty: ${values.join(', ')}.`);
  return match;
};

const text = (max) => (raw) => {
  const value = String(raw).trim();
  if (value.length > max) throw new ProposalError(`Text je delší než ${max} znaků.`);
  return value;
};

// Phone, e-mail and web may hold several values: one is stored as itself,
// several as a JSON array string (as the app's multi-value fields do).
const multiValue = (raw) => {
  const values = (Array.isArray(raw) ? raw : [raw]).map((value) => String(value).trim()).filter(Boolean);
  if (values.length === 0) return null;
  return values.length === 1 ? values[0] : JSON.stringify(values);
};

const ico = (raw) => {
  const value = normalizeIco(String(raw).replace(/\s+/g, ''));
  if (!value || !isValidIco(value)) throw new ProposalError(`IČO ${raw} není platné (nesedí kontrolní číslice).`);
  return value;
};

const date = (raw) => {
  const value = String(raw).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const czech = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(value);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : czech ? [czech[3], czech[2], czech[1]] : [];
  if (!year) throw new ProposalError('Datum zadej jako 2026-11-30 nebo 30.11.2026.');
  const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (check.getUTCMonth() !== Number(month) - 1) throw new ProposalError(`Datum ${value} neexistuje.`);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// What Jarvis may change, per record kind: the field, its label and how a new
// value is checked. Names, companies, obor and places are not here — they are
// trees and links the profile panel edits as a whole.
export const SUBJECT_FIELDS = {
  ico: { label: 'IČO', parse: ico },
  phone: { label: 'Telefon', parse: multiValue },
  email: { label: 'E-mail', parse: multiValue },
  website: { label: 'Web', parse: multiValue },
  tier: { label: 'Úroveň', parse: pickFrom(TIERS) },
  info: { label: 'Popis / Poznámky', parse: text(4000) },
};

export const COMMISSION_FIELDS = {
  state: { label: 'Stav', parse: pickFrom(WORKFLOW_STATES) },
  deadline: { label: 'Termín', parse: date },
  priority: { label: 'Priorita', parse: pickFrom(PRIORITIES) },
  commission_value: { label: 'Provize', parse: text(200) },
  budget: { label: 'Rozpočet', parse: text(200) },
  notes: { label: 'Poznámky', parse: text(4000) },
};

// The Kraj values the app offers (REGION_OPTIONS in client/src/usersGrid/
// regions.ts); keep the two lists the same.
const REGIONS = [
  'Celá ČR', 'Praha', 'Středočeský kraj', 'Jihočeský kraj', 'Plzeňský kraj', 'Karlovarský kraj', 'Ústecký kraj',
  'Liberecký kraj', 'Královéhradecký kraj', 'Pardubický kraj', 'Vysočina', 'Jihomoravský kraj', 'Olomoucký kraj',
  'Zlínský kraj', 'Moravskoslezský kraj', 'Zahraničí',
];
const REGION_ALIASES = { 'hlavní město praha': 'Praha', 'kraj vysočina': 'Vysočina' };
const region = (raw) => pickFrom(REGIONS)(REGION_ALIASES[String(raw).trim().toLowerCase()] ?? raw);

// What a new subject may be created with: the field, its column in the
// create payload (the same one the app's create form sends), label and check.
// Společnost, Kraj and Lokalita go in as the flat columns; the profile's
// trees are derived from them on read (client/src/usersGrid/hierarchy.ts).
export const CREATE_SUBJECT_FIELDS = {
  name: { column: 'first_name', label: 'Jméno', parse: text(200) },
  company: { column: 'company_name', label: 'Společnost', parse: text(200) },
  ico: { column: 'ico', label: 'IČO', parse: ico },
  phone: { column: 'phone', label: 'Telefon', parse: multiValue },
  email: { column: 'email', label: 'E-mail', parse: multiValue },
  website: { column: 'website', label: 'Web', parse: multiValue },
  tier: { column: 'tier', label: 'Úroveň', parse: pickFrom(TIERS) },
  region: { column: 'region', label: 'Kraj', parse: region },
  location: { column: 'location', label: 'Lokalita', parse: text(300) },
  info: { column: 'info', label: 'Popis / Poznámky', parse: text(4000) },
};

export const CREATE_COMMISSION_FIELDS = {
  position: { column: 'position', label: 'Zakázka', parse: text(200) },
  service_position: { column: 'service_position', label: 'Typ služby', parse: text(200) },
  ...Object.fromEntries(Object.entries(COMMISSION_FIELDS).map(([field, spec]) => [field, { column: field, ...spec }])),
};

export const PROPOSAL_LIMITS = { states: WORKFLOW_STATES, priorities: PRIORITIES, tiers: TIERS, regions: REGIONS };

// A stored value as people read it: dates without time, lists joined.
const display = (field, raw) => {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (field === 'deadline') {
    const value = String(raw);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' });
  }
  const unpacked = unpackValue(raw);
  return Array.isArray(unpacked) ? unpacked.join(', ') : String(unpacked);
};

// Two stored values are the same if they read the same (an ISO deadline and
// its date-only form, a scalar and a one-element list). A company tree is
// compared as its parsed JSON.
const canonicalJson = (raw) => {
  if (raw === null || raw === undefined || raw === '') return '';
  try {
    return JSON.stringify(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch {
    return String(raw);
  }
};
const sameValue = (field, left, right) =>
  field === 'company_structure'
    ? canonicalJson(left) === canonicalJson(right)
    : field === 'assigned_user_ids'
      ? sortedIds(left) === sortedIds(right)
      : display(field, left) === display(field, right);

// Assigned users: the same people in any order are the same assignment.
const sortedIds = (raw) => (Array.isArray(raw) ? raw : unpackValue(raw) ?? [])
  .map(Number)
  .filter(Number.isInteger)
  .sort((a, b) => a - b)
  .join(',');

/**
 * Who is responsible for a subject or a zakázka: `names` matched against the
 * team (username, case and accents ignored), then replace, add or remove.
 * The card shows names; the app stores ids (and fills assigned_to itself).
 */
export function buildAssignProposal({ kind, section, role, record, names, mode = 'replace', team, reason, label }) {
  const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const picked = [];
  for (const name of names ?? []) {
    const wanted = fold(name);
    const matches = team.filter((user) => fold(user.username) === wanted);
    const loose = matches.length ? matches : team.filter((user) => fold(user.username).includes(wanted) || wanted.includes(fold(user.username)));
    if (loose.length !== 1) {
      throw new ProposalError(
        `${loose.length ? `„${name}“ odpovídá víc lidem` : `„${name}“ v týmu není`}. Uživatelé: ${team.map((user) => user.username).join(', ')}.`
      );
    }
    if (!picked.includes(loose[0])) picked.push(loose[0]);
  }
  const current = (Array.isArray(record.assigned_user_ids) ? record.assigned_user_ids : []).map(Number);
  const pickedIds = picked.map((user) => Number(user.id));
  const next =
    mode === 'add' ? [...new Set([...current, ...pickedIds])]
      : mode === 'remove' ? current.filter((id) => !pickedIds.includes(id))
        : pickedIds;
  if (sortedIds(current) === sortedIds(next)) throw new ProposalError('Přiřazení už je takové – není co měnit.');
  const nameOf = (id) => team.find((user) => Number(user.id) === id)?.username ?? `#${id}`;
  const text = (ids) => (ids.length ? ids.map(nameOf).join(', ') : '—');
  return {
    id: crypto.randomUUID(),
    type: 'update',
    kind,
    section,
    role,
    recordId: Number(record.id),
    label,
    where: `${kind === 'commission' ? 'Zakázka' : ROLE_LABELS[role]} · ${SECTION_LABELS[section]}`,
    changes: [{ field: 'assigned_user_ids', label: 'Přiřazení', from: current, to: next, fromText: text(current), toText: text(next) }],
    reason: reason ? String(reason).slice(0, 300) : undefined,
    createdAt: new Date().toISOString(),
  };
}

/**
 * A to-do in Úkoly: add one (personal or team list) or mark one done. The
 * card shows the task; confirming writes it through the tasks API, whose live
 * stream shows it to everyone at once. `task` is the current task for "done".
 */
export function buildTaskProposal({ action, list = 'personal', title, dueDate, important, assignee, task, team = [] }) {
  if (action === 'done') {
    if (!task) throw new ProposalError('Úkol s tímto id jsem nenašel. Načti úkoly znovu (nástroj tasks).');
    if (task.status === 'done') throw new ProposalError('Tento úkol už je hotový.');
    return {
      id: crypto.randomUUID(),
      type: 'task',
      action: 'done',
      label: truncateText(task.title, 120),
      where: `Úkoly · ${task.list === 'team' ? 'týmové' : 'moje'}`,
      changes: [{ field: 'status', label: 'Stav', from: task.status, to: 'done', fromText: task.status === 'later' ? 'Později' : 'K udělání', toText: 'Hotovo' }],
      payload: { taskId: Number(task.id), title: task.title },
      createdAt: new Date().toISOString(),
    };
  }
  const text = String(title ?? '').trim();
  if (!text) throw new ProposalError('Úkol nemá název.');
  if (text.length > 500) throw new ProposalError('Název úkolu je delší než 500 znaků.');
  const due = dueDate ? date(dueDate) : null;
  let assigneeUserId = null;
  if (assignee) {
    if (list !== 'team') throw new ProposalError('Přidělit kolegovi jde jen úkol na týmovém seznamu (list = team).');
    const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const match = team.filter((user) => fold(user.username) === fold(assignee));
    if (match.length !== 1) throw new ProposalError(`„${assignee}“ v týmu není. Uživatelé: ${team.map((user) => user.username).join(', ')}.`);
    assigneeUserId = Number(match[0].id);
  }
  const rows = [{ field: 'title', label: 'Úkol', from: null, to: text, fromText: '', toText: text }];
  if (due) rows.push({ field: 'dueDate', label: 'Termín', from: null, to: due, fromText: '', toText: display('deadline', due) });
  if (important) rows.push({ field: 'important', label: 'Důležitý', from: null, to: true, fromText: '', toText: 'ano' });
  if (assigneeUserId) rows.push({ field: 'assignee', label: 'Přiděleno', from: null, to: assigneeUserId, fromText: '', toText: team.find((user) => Number(user.id) === assigneeUserId)?.username });
  return {
    id: crypto.randomUUID(),
    type: 'task',
    action: 'add',
    label: list === 'team' ? 'Nový týmový úkol' : 'Nový úkol',
    where: `Úkoly · ${list === 'team' ? 'týmové' : 'moje'}`,
    changes: rows,
    payload: { list, title: text, dueDate: due, important: Boolean(important), assigneeUserId },
    createdAt: new Date().toISOString(),
  };
}

const truncateText = (value, length) => {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

async function applyTask(proposal, api) {
  if (proposal.action === 'add') {
    const { list, title, dueDate, important, assigneeUserId } = proposal.payload;
    await api.request('POST', '/api/tasks', {
      list,
      title,
      ...(dueDate ? { dueDate } : {}),
      ...(important ? { important: true } : {}),
      ...(assigneeUserId ? { assigneeUserId } : {}),
    });
    return;
  }
  // Done: the task must still be there and still open.
  const lists = await Promise.all(['personal', 'team'].map((list) => api.request('GET', `/api/tasks?list=${list}`).catch(() => null)));
  const task = lists.flatMap((page) => page?.tasks ?? []).find((item) => Number(item.id) === proposal.payload.taskId);
  if (!task) throw new ProposalError('Úkol už v seznamu není, nic jsem neměnil.');
  if (task.status === 'done') return;
  await api.request('PATCH', `/api/tasks/${proposal.payload.taskId}`, { status: 'done' });
}

/**
 * An Obor (and optionally its Zaměření) for a subject, from the section's own
 * catalog. The card shows the obors before and after; confirming writes the
 * company tree with its flat mirrors (field, field_specialization), as the
 * profile panel does. `catalog` is { obors: string[], specializations:
 * Map<obor, string[]> }.
 */
export function buildOborProposal({ section, role, record, obor, specialization, company, catalog, reason, label }) {
  const findIn = (list, value) => list.find((item) => item.toLocaleLowerCase('cs') === String(value ?? '').trim().toLocaleLowerCase('cs'));
  const pickedObor = findIn(catalog.obors, obor);
  if (!pickedObor) {
    throw new ProposalError(
      `Obor „${obor}“ v nabídce této sekce není. Vyber přesně jeden z: ${catalog.obors.join(', ')}.`
    );
  }
  let pickedSpecialization = '';
  if (specialization) {
    const allowed = catalog.specializations.get(pickedObor) ?? [];
    pickedSpecialization = findIn(allowed, specialization) ?? '';
    if (!pickedSpecialization) {
      throw new ProposalError(
        allowed.length
          ? `Zaměření „${specialization}“ k oboru ${pickedObor} v nabídce není. Možnosti: ${allowed.join(', ')}. Nebo zaměření vynech.`
          : `Obor ${pickedObor} nemá v nabídce žádná zaměření – navrhni ho bez zaměření.`
      );
    }
  }
  const before = readCompanyTree(record);
  const after = withObor(before, { obor: pickedObor, specialization: pickedSpecialization, company });
  const updates = companyTreeUpdates(after);
  const current = record.company_structure ?? null;
  if (canonicalJson(current) === canonicalJson(updates.company_structure) && display('field', record.field) === display('field', updates.field)) {
    throw new ProposalError('Tento obor (a zaměření) už subjekt má – není co měnit.');
  }
  return {
    id: crypto.randomUUID(),
    type: 'update',
    kind: 'subject',
    section,
    role,
    recordId: Number(record.id),
    label,
    where: `${ROLE_LABELS[role]} · ${SECTION_LABELS[section]}`,
    // The card shows one row; the tree is what is checked for a later edit.
    changes: [
      { field: 'company_structure', label: 'Obor / Zaměření', from: current, to: updates.company_structure, fromText: describeObors(before), toText: describeObors(after) },
    ],
    // Written with it, not shown: the tree's flat mirrors.
    alsoWrite: { field: updates.field, field_specialization: updates.field_specialization },
    reason: reason ? String(reason).slice(0, 300) : undefined,
    createdAt: new Date().toISOString(),
  };
}

const recordPath = (proposal) =>
  `${proposal.kind === 'commission' ? commissionsPath(proposal.section, proposal.role) : entitiesPath(proposal.section, proposal.role)}/${proposal.recordId}`;

/**
 * Check a proposed field update against the record as it is now. Returns the
 * proposal (not yet applied), or throws ProposalError with a reason the model
 * can act on.
 */
export function buildUpdateProposal({ kind, section, role, record, changes, reason, label }) {
  const fields = kind === 'commission' ? COMMISSION_FIELDS : SUBJECT_FIELDS;
  const rows = [];
  for (const [field, raw] of Object.entries(changes ?? {})) {
    if (raw === undefined) continue;
    const spec = fields[field];
    if (!spec) {
      throw new ProposalError(`Pole ${field} měnit nelze. ${kind === 'commission' ? 'U zakázky' : 'U subjektu'} lze měnit: ${Object.keys(fields).join(', ')}.`);
    }
    let next;
    try {
      next = raw === null || raw === '' ? null : spec.parse(raw);
    } catch (error) {
      throw new ProposalError(`${spec.label}: ${error.message}`);
    }
    const current = record[field] ?? null;
    if (sameValue(field, current, next)) continue;
    rows.push({ field, label: spec.label, from: current, to: next, fromText: display(field, current), toText: display(field, next) });
  }
  if (rows.length === 0) throw new ProposalError('Navržené hodnoty už v záznamu jsou – není co měnit.');
  return {
    id: crypto.randomUUID(),
    type: 'update',
    kind,
    section,
    role,
    recordId: Number(record.id),
    label,
    where: `${kind === 'commission' ? 'Zakázka' : ROLE_LABELS[role]} · ${SECTION_LABELS[section]}`,
    changes: rows,
    reason: reason ? String(reason).slice(0, 300) : undefined,
    createdAt: new Date().toISOString(),
  };
}

export function buildNoteProposal({ section, role, record, content, reason, label }) {
  const note = String(content ?? '').trim();
  if (!note) throw new ProposalError('Poznámka je prázdná.');
  if (note.length > 4000) throw new ProposalError('Poznámka je delší než 4000 znaků.');
  return {
    id: crypto.randomUUID(),
    type: 'note',
    kind: 'subject',
    section,
    role,
    recordId: Number(record.id),
    label,
    where: `${ROLE_LABELS[role]} · ${SECTION_LABELS[section]}`,
    note,
    reason: reason ? String(reason).slice(0, 300) : undefined,
    createdAt: new Date().toISOString(),
  };
}

// Values for a new record, checked: the payload columns, and card rows with
// no "from" (there is nothing before).
const parseNew = (specs, values, what) => {
  const payload = {};
  const rows = [];
  for (const [field, raw] of Object.entries(values ?? {})) {
    if (raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) continue;
    const spec = specs[field];
    if (!spec) throw new ProposalError(`Pole ${field} u ${what} zadat nelze. Lze: ${Object.keys(specs).join(', ')}.`);
    let value;
    try {
      value = spec.parse(raw);
    } catch (error) {
      throw new ProposalError(`${spec.label}: ${error.message}`);
    }
    if (value === null || value === '') continue;
    payload[spec.column] = value;
    rows.push({ field, label: spec.label, fromText: '', toText: display(field, value) });
  }
  return { payload, rows };
};

const STATUS_LABELS = { accepted: 'Aktivní', pending: 'Ke schválení' };

const settingsRows = ({ status, assignee }) => [
  { field: 'status', label: 'Zařadit do', fromText: '', toText: STATUS_LABELS[status] },
  ...(assignee ? [{ field: 'assigned', label: 'Přiřazeno', fromText: '', toText: assignee.name }] : []),
];

/**
 * A new subject (klient / partner / tipař), optionally with its first
 * zakázka. `duplicates` are similar records already in that list; they are
 * shown on the card so the user does not create a second copy by accident.
 */
export function buildCreateSubjectProposal({ section, role, subject, commission, status = 'accepted', assignee, duplicates = [], reason }) {
  const entity = parseNew(CREATE_SUBJECT_FIELDS, subject, 'subjektu');
  if (!entity.payload.first_name && !entity.payload.company_name) {
    throw new ProposalError('Nový subjekt potřebuje aspoň jméno nebo společnost.');
  }
  if (entity.payload.location && !entity.payload.region) {
    throw new ProposalError('Lokalita patří pod kraj: zadej i Kraj.');
  }
  const assigned = assignee ? [assignee.id] : [];
  const first = commission && Object.values(commission).some((value) => value !== undefined && value !== null && value !== '')
    ? parseNew(CREATE_COMMISSION_FIELDS, commission, 'zakázky')
    : null;
  if (first && !first.payload.position) throw new ProposalError('Zakázka potřebuje název (position).');

  const label = [entity.payload.company_name, entity.payload.first_name].filter(Boolean).join(' · ');
  return {
    id: crypto.randomUUID(),
    type: 'create_subject',
    kind: 'subject',
    section,
    role,
    recordId: null,
    label,
    where: `Nový ${ROLE_LABELS[role].toLowerCase()} · ${SECTION_LABELS[section]}`,
    changes: [...entity.rows, ...settingsRows({ status, assignee })],
    ...(first ? { commissionChanges: first.rows } : {}),
    payload: {
      entity: { ...entity.payload, status, assigned_user_ids: assigned },
      ...(first ? { commission: { ...first.payload, status, assigned_user_ids: assigned } } : {}),
    },
    ...(duplicates.length ? { warnings: duplicates.map((duplicate) => `Podobný záznam už existuje: ${duplicate}`) } : {}),
    reason: reason ? String(reason).slice(0, 300) : undefined,
    createdAt: new Date().toISOString(),
  };
}

/** A new zakázka for an existing subject (`record`, read fresh). */
export function buildCreateCommissionProposal({ section, role, record, commission, status = 'accepted', assignee, reason, label }) {
  const parsed = parseNew(CREATE_COMMISSION_FIELDS, commission, 'zakázky');
  if (!parsed.payload.position) throw new ProposalError('Zakázka potřebuje název (position).');
  return {
    id: crypto.randomUUID(),
    type: 'create_commission',
    kind: 'commission',
    section,
    role,
    recordId: Number(record.id),
    label: `Nová zakázka: ${parsed.payload.position}`,
    where: `${label} · ${SECTION_LABELS[section]}`,
    changes: [...parsed.rows, ...settingsRows({ status, assignee })],
    payload: {
      ...parsed.payload,
      entity_id: Number(record.id),
      status,
      assigned_user_ids: assignee ? [assignee.id] : [],
    },
    reason: reason ? String(reason).slice(0, 300) : undefined,
    createdAt: new Date().toISOString(),
  };
}

// A one-line description, for the change log and for Jarvis's next turn.
export const describeProposal = (proposal) => {
  if (proposal.type === 'note') return `${proposal.label}: nová poznámka`;
  if (proposal.type === 'task') return proposal.action === 'done' ? `úkol „${proposal.label}“ hotový` : `nový úkol „${proposal.payload?.title}“ (${proposal.where})`;
  if (proposal.type === 'create_subject') {
    return `nový ${ROLE_LABELS[proposal.role].toLowerCase()} ${proposal.label} (${SECTION_LABELS[proposal.section]})${proposal.payload?.commission ? ` se zakázkou ${proposal.payload.commission.position}` : ''}`;
  }
  if (proposal.type === 'create_commission') return `${proposal.label} (${proposal.where})`;
  return `${proposal.label}: ${proposal.changes.map((change) => `${change.label} ${change.fromText} → ${change.toText}`).join(', ')}`;
};

const createdSubject = (proposal, entity, commission) => ({
  kind: 'subject',
  section: proposal.section,
  role: proposal.role,
  id: Number(entity.id),
  code: [entity.entity_id, commission?.commission_id].filter(Boolean).join(' / '),
});

async function applyCreate(proposal, api) {
  const base = entitiesPath(proposal.section, proposal.role);
  if (proposal.type === 'create_subject') {
    if (proposal.payload.commission) {
      const response = await api.request('POST', `${base}/with-commission`, proposal.payload);
      return { created: createdSubject(proposal, response.entity, response.commission) };
    }
    const entity = await api.request('POST', base, proposal.payload.entity);
    return { created: createdSubject(proposal, entity, null) };
  }
  // A zakázka: its subject must still be there.
  try {
    await api.request('GET', `${base}/${proposal.recordId}`);
  } catch (error) {
    if (error?.status === 404) throw new ProposalError('Subjekt mezitím někdo smazal, zakázku jsem nevytvořil.');
    throw error;
  }
  const path = commissionsPath(proposal.section, proposal.role);
  const response = await api.request('POST', path, proposal.payload);
  const commission = response?.commission_id ? response : await api.request('GET', `${path}/${response.id}`);
  return {
    created: {
      kind: 'commission',
      section: proposal.section,
      role: proposal.role,
      id: Number(commission.id),
      code: commission.commission_id,
    },
  };
}

/**
 * Apply a confirmed proposal through the app's API. Throws ProposalError when
 * the record has changed since (nothing is written then). A create returns
 * `{ created: { kind, section, role, id, code } }`.
 */
export async function applyProposal(proposal, api) {
  if (proposal.type === 'create_subject' || proposal.type === 'create_commission') {
    return applyCreate(proposal, api);
  }
  if (proposal.type === 'task') {
    return applyTask(proposal, api);
  }
  if (proposal.type === 'note') {
    await api.request('POST', `/${documentResource(proposal.section, proposal.role)}/${proposal.recordId}/notes`, { content: proposal.note });
    return;
  }
  const current = await api.request('GET', recordPath(proposal));
  const moved = proposal.changes.filter((change) => !sameValue(change.field, current?.[change.field] ?? null, change.from));
  if (moved.length) {
    throw new ProposalError(
      `Záznam se mezitím změnil (${moved.map((change) => change.label).join(', ')}), změnu jsem proto neprovedl. Požádejte Jarvise o nový návrh.`
    );
  }
  const payload = { ...Object.fromEntries(proposal.changes.map((change) => [change.field, change.to])), ...(proposal.alsoWrite ?? {}) };
  await api.request('PUT', recordPath(proposal), payload);
}
