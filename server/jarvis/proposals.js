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

export const PROPOSAL_LIMITS = { states: WORKFLOW_STATES, priorities: PRIORITIES, tiers: TIERS };

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
// its date-only form, a scalar and a one-element list).
const sameValue = (field, left, right) => display(field, left) === display(field, right);

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

// A one-line description, for the change log and for Jarvis's next turn.
export const describeProposal = (proposal) =>
  proposal.type === 'note'
    ? `${proposal.label}: nová poznámka`
    : `${proposal.label}: ${proposal.changes.map((change) => `${change.label} ${change.fromText} → ${change.toText}`).join(', ')}`;

/**
 * Apply a confirmed proposal through the app's API. Throws ProposalError when
 * the record has changed since (nothing is written then).
 */
export async function applyProposal(proposal, api) {
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
  const payload = Object.fromEntries(proposal.changes.map((change) => [change.field, change.to]));
  await api.request('PUT', recordPath(proposal), payload);
}
