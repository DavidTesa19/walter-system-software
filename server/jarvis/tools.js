// Jarvis's tools. Step 1 is read-only: find, list, count and describe records,
// show the change log to admins, and offer to open a record in the app.
//
// Every tool reads through the app's own API as the user Jarvis works for, so
// it sees exactly what that user may see. Inputs are validated with zod before
// a tool runs (the model's arguments are untrusted), and results are kept
// compact: each one is re-read on every later turn of the conversation.

import { z } from 'zod/v4';
import {
  FIELD_LABELS,
  KINDS,
  ROLES,
  ROLE_LABELS,
  SECTIONS,
  SECTION_LABELS,
  STATUSES,
  STATUS_LABELS,
  commissionName,
  commissionsPath,
  describeFields,
  documentResource,
  entitiesPath,
  normalizeText,
  personName,
  recordRef,
  searchableText,
  subjectName,
  truncate,
  unpackValue,
} from './catalog.js';
import { matchRecord, recordWords } from './fuzzy.js';

export class ToolError extends Error {}

const section = z.enum(SECTIONS);
const role = z.enum(ROLES);
const kind = z.enum(KINDS);
const status = z.enum(STATUSES);

const SECTION_HELP = 'public = Veřejné, projects = Neveřejné, growth = Growth Club';
const ROLE_HELP = 'client = Klient, partner = Partner, tiper = Tipař';

// ---------------------------------------------------------------------------
// Loading records through the API (cached per agent run by the client).
// ---------------------------------------------------------------------------

async function loadTeam(ctx) {
  if (!ctx.teamById) {
    const users = await ctx.api.get('/api/team-users').catch(() => []);
    ctx.teamById = new Map((Array.isArray(users) ? users : []).map((user) => [Number(user.id), user]));
  }
  return ctx.teamById;
}

function allowedSections(ctx, requested) {
  const wanted = requested?.length ? requested : SECTIONS;
  const allowed = wanted.filter((item) => ctx.sections.includes(item));
  if (requested?.length && allowed.length === 0) {
    throw new ToolError(`Uživatel nemá přístup do sekcí: ${requested.map((item) => SECTION_LABELS[item]).join(', ')}.`);
  }
  return allowed;
}

function assertSection(ctx, value) {
  if (!ctx.sections.includes(value)) {
    throw new ToolError(`Uživatel nemá přístup do sekce ${SECTION_LABELS[value]}.`);
  }
}

async function loadRows(ctx, { sections, roles, kinds, statuses }) {
  const jobs = [];
  for (const sectionId of sections) {
    for (const roleId of roles) {
      for (const kindId of kinds) {
        for (const statusId of statuses) {
          const base = kindId === 'subject' ? entitiesPath(sectionId, roleId) : commissionsPath(sectionId, roleId);
          jobs.push(
            ctx.api.get(`${base}?status=${statusId}`).then((rows) =>
              (Array.isArray(rows) ? rows : []).map((row) => ({ row, section: sectionId, role: roleId, kind: kindId }))
            )
          );
        }
      }
    }
  }
  return (await Promise.all(jobs)).flat();
}

// One line per record in a list: enough to recognise it and to ask for more.
function compactRecord({ row, section: sectionId, role: roleId, kind: kindId }, teamById) {
  const base = {
    ref: recordRef({ section: sectionId, role: roleId, kind: kindId, id: row.id }),
    sekce: SECTION_LABELS[sectionId],
    role: ROLE_LABELS[roleId],
    stav: STATUS_LABELS[row.status] ?? row.status,
  };
  if (kindId === 'subject') {
    return {
      ...base,
      typ: 'subjekt',
      kod: row.entity_id,
      nazev: subjectName(row),
      osoba: personName(row) || undefined,
      telefon: row.phone || undefined,
      email: row.email || undefined,
      obor: unpackValue(row.field) || undefined,
      lokalita: unpackValue(row.location) || unpackValue(row.region) || undefined,
    };
  }
  const assigned = (row.assigned_user_ids ?? []).map((id) => teamById?.get(Number(id))?.username).filter(Boolean).join(', ');
  return {
    ...base,
    typ: 'zakázka',
    kod: row.commission_id,
    nazev: commissionName(row),
    subjekt: `${row.entity_code ?? ''} ${subjectName(row)}`.trim(),
    subjekt_ref: recordRef({ section: sectionId, role: roleId, kind: 'subject', id: row.entity_id }),
    stav_zakazky: row.state || undefined,
    termin: row.deadline || undefined,
    odpovedny: assigned || row.assigned_to || undefined,
  };
}

// Fields a filter, sort or grouping can name. `assigned` and the section/role
// labels are derived; everything else is a column of the record.
function fieldValue(item, field, teamById) {
  const { row } = item;
  switch (field) {
    case 'assigned': {
      const names = (row.assigned_user_ids ?? []).map((id) => teamById?.get(Number(id))?.username).filter(Boolean);
      if (row.assigned_to) names.push(String(row.assigned_to));
      return names.join(', ');
    }
    case 'section':
      return SECTION_LABELS[item.section];
    case 'role':
      return ROLE_LABELS[item.role];
    case 'name':
      return item.kind === 'subject' ? subjectName(row) : commissionName(row);
    default:
      return unpackValue(row[field]);
  }
}

// The separate values of a field, for grouping. Multi-value fields are stored
// as a JSON array, and a single value may itself contain commas
// ("Design (grafický, průmyslový, …)"), so never split on text.
function fieldValues(item, field, teamById) {
  const { row } = item;
  if (field === 'assigned') {
    const names = (row.assigned_user_ids ?? []).map((id) => teamById?.get(Number(id))?.username).filter(Boolean);
    if (row.assigned_to) names.push(String(row.assigned_to));
    return names;
  }
  const raw = row[field];
  if (typeof raw === 'string' && raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((value) => String(value).trim()).filter(Boolean);
    } catch {
      // Not JSON — treat as one value.
    }
  }
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  const value = fieldValue(item, field, teamById);
  return isEmptyValue(value) ? [] : [String(value)];
}

const isEmptyValue = (value) => value === null || value === undefined || String(value).trim() === '';

// Dates in this data are ISO timestamps or hand-typed Czech dates (1.12.2026).
function parseDate(value) {
  if (isEmptyValue(value)) return null;
  const text = String(value).trim();
  const czech = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(text);
  if (czech) return new Date(Number(czech[3]), Number(czech[2]) - 1, Number(czech[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function matchesFilter(item, filter, teamById) {
  const value = fieldValue(item, filter.field, teamById);
  switch (filter.op) {
    case 'is_empty':
      return isEmptyValue(value);
    case 'not_empty':
      return !isEmptyValue(value);
    case 'equals':
      return normalizeText(value).trim() === normalizeText(filter.value).trim();
    case 'contains':
      return normalizeText(value).includes(normalizeText(filter.value));
    case 'not_contains':
      return !normalizeText(value).includes(normalizeText(filter.value));
    case 'before':
    case 'after': {
      const left = parseDate(value);
      const right = parseDate(filter.value);
      if (!left || !right) return false;
      return filter.op === 'before' ? left < right : left > right;
    }
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const searchInput = z.object({
  query: z.string().min(1).describe('Co hledat: jméno, firma, telefon, e-mail, kód (K001, K001-002), obor, město, text z popisu…'),
  sections: z.array(section).optional().describe(`Omezit na sekce (${SECTION_HELP}). Bez zadání všechny, kam má uživatel přístup.`),
  roles: z.array(role).optional().describe(`Omezit na role (${ROLE_HELP}).`),
  kinds: z.array(kind).optional().describe('subject = subjekty, commission = zakázky. Bez zadání obojí.'),
  statuses: z.array(status).optional().describe('accepted = aktivní, pending = ke schválení, archived = archiv. Výchozí: accepted a pending.'),
  limit: z.number().int().min(1).max(50).optional().describe('Kolik výsledků vrátit, výchozí 15.'),
}).strict();

const filterInput = z.object({
  field: z.string().min(1).describe('Pole záznamu, např. company_name, field (obor), region (kraj), location, tier, state, priority, deadline, budget, commission_value, category, service, assigned (přiřazení lidé), created_at, updated_at. U zakázek jsou pole jejich subjektu jako entity_field, entity_region, entity_company_name.'),
  op: z.enum(['contains', 'not_contains', 'equals', 'is_empty', 'not_empty', 'before', 'after']),
  value: z.string().optional().describe('Hodnota pro contains/not_contains/equals; datum (2026-12-31 nebo 31.12.2026) pro before/after.'),
}).strict();

const listInput = z.object({
  kind,
  sections: z.array(section).optional().describe(`${SECTION_HELP}. Bez zadání všechny dostupné.`),
  roles: z.array(role).optional().describe(`${ROLE_HELP}. Bez zadání všechny.`),
  statuses: z.array(status).optional().describe('Výchozí: jen accepted (aktivní).'),
  filters: z.array(filterInput).optional().describe('Všechny podmínky musí platit současně.'),
  sort: z.object({ field: z.string(), direction: z.enum(['asc', 'desc']).optional() }).strict().optional(),
  group_by: z.string().optional().describe('Místo seznamu vrátit počty podle tohoto pole (např. field, region, assigned, state, role, section). Pole s více hodnotami se počítají za každou hodnotu.'),
  limit: z.number().int().min(1).max(100).optional().describe('Kolik záznamů vrátit, výchozí 25. Celkový počet se vrací vždy.'),
}).strict();

const recordInput = z.object({
  section,
  role,
  id: z.number().int().positive().describe('Interní číselné id (poslední část ref, např. ref public/client/subject/12 → 12).'),
}).strict();

const changesInput = z.object({
  hours: z.number().int().min(1).max(24 * 90).optional().describe('Jak daleko do minulosti, výchozí 24 hodin.'),
  query: z.string().optional().describe('Hledat v obsahu změn (název firmy, kód…).'),
  user_id: z.number().int().positive().optional().describe('Jen změny tohoto uživatele (id z list_team).'),
}).strict();

const openInput = z.object({
  section,
  role,
  kind,
  id: z.number().int().positive(),
  label: z.string().max(120).optional().describe('Krátký popisek tlačítka, např. „K012 · Novák Stavby“.'),
}).strict();

export const TOOLS = [
  {
    name: 'search',
    description:
      'Fulltextové hledání v subjektech (klienti, partneři, tipaři) a jejich zakázkách napříč sekcemi. ' +
      'Použij vždy, když uživatel zmíní konkrétní firmu, osobu, telefon, e-mail nebo kód, nebo když nevíš, kde záznam je. ' +
      'Hledá bez ohledu na diakritiku a velikost písmen; všechna slova dotazu musí v záznamu být. ' +
      'Toleruje překlepy, chyby přepisu řeči, české koncovky (Dvořákovi) i kódy bez nul (K12): když přesných výsledků je málo, ' +
      'přidá priblizne_shody. Ty nejsou jisté – podej je jako „nejspíš myslíte…“ a u jedné jasné shody s ní rovnou pracuj, ' +
      'u více kandidátů se zeptej. Hledej jméno tak, jak ho uživatel napsal/řekl; nehádej pravopis sám. ' +
      'Vrací ref, který pak předáš do get_subject / get_commission / open_record.',
    input: searchInput,
    label: (input) => `Hledám „${truncate(input.query, 40)}“`,
    async run(input, ctx) {
      const teamById = await loadTeam(ctx);
      const items = await loadRows(ctx, {
        sections: allowedSections(ctx, input.sections),
        roles: input.roles?.length ? input.roles : ROLES,
        kinds: input.kinds?.length ? input.kinds : KINDS,
        statuses: input.statuses?.length ? input.statuses : ['accepted', 'pending'],
      });
      const tokens = normalizeText(input.query).split(/[\s,;]+/).filter(Boolean);
      // What a record is called: a hit here ranks above one in, say, a note.
      const titleOf = (item) =>
        normalizeText(
          item.kind === 'subject'
            ? `${subjectName(item.row)} ${personName(item.row)} ${item.row.entity_id}`
            : `${commissionName(item.row)} ${item.row.commission_id} ${subjectName(item.row)}`
        );
      const byScore = (a, b) =>
        b.score - a.score || String(b.item.row.updated_at ?? '').localeCompare(String(a.item.row.updated_at ?? ''));

      const hits = [];
      const misses = [];
      for (const item of items) {
        const text = searchableText(item.row, teamById);
        if (!tokens.every((token) => text.includes(token))) {
          misses.push({ item, text });
          continue;
        }
        const title = titleOf(item);
        const score = tokens.filter((token) => title.includes(token)).length * 10 + (item.kind === 'subject' ? 1 : 0);
        hits.push({ item, score });
      }
      hits.sort(byScore);

      // Too few exact hits: look for near misses (typos, a misheard name).
      let approximate = [];
      if (hits.length < 3) {
        for (const { item, text } of misses) {
          const result = matchRecord(tokens, text, recordWords(text));
          if (!result) continue;
          const title = titleOf(item);
          const inTitle = matchRecord(tokens, title, recordWords(title));
          approximate.push({
            item,
            // How close the match is counts most; where it is, less.
            score: result.score + (inTitle ? inTitle.score * 0.3 : 0) + (item.kind === 'subject' ? 0.1 : 0),
            matched: result.matched,
          });
        }
        approximate.sort(byScore);
        // Only the near misses about as close as the best one: "nowak" means
        // Novák, not every "Nová společnost" one letter further away.
        const cutoff = (approximate[0]?.score ?? 0) - 0.2 * tokens.length;
        approximate = approximate.filter((entry) => entry.score >= cutoff);
      }

      const limit = input.limit ?? 15;
      return {
        nalezeno: hits.length,
        zobrazeno: Math.min(limit, hits.length),
        vysledky: hits.slice(0, limit).map(({ item }) => compactRecord(item, teamById)),
        ...(approximate.length
          ? {
              priblizne_shody: {
                pocet: approximate.length,
                poznamka: 'Přibližné shody, ne přesné: ověř je s uživatelem („nejspíš myslíte…“).',
                vysledky: approximate.slice(0, Math.min(limit, 8)).map(({ item, matched }) => ({
                  ...compactRecord(item, teamById),
                  podobnost: matched.length ? matched.join(', ') : undefined,
                })),
              },
            }
          : {}),
      };
    },
  },
  {
    name: 'list_records',
    description:
      'Výpis, filtrování, řazení a počítání subjektů nebo zakázek podle polí. ' +
      'Použij pro otázky typu „kolik máme klientů v Praze“, „zakázky bez odpovědné osoby“, „partneři s oborem stavebnictví“, ' +
      '„zakázky s termínem do konce měsíce“, „rozdělení klientů podle kraje“. Pro hledání konkrétního jména použij search. ' +
      'Vrací vždy celkový počet; s group_by vrací počty po skupinách místo seznamu.',
    input: listInput,
    label: (input) => {
      const what = input.kind === 'subject' ? 'subjekty' : 'zakázky';
      if (!input.group_by) return `Procházím ${what}`;
      const by = { assigned: 'přiřazení', section: 'sekce', role: 'role' }[input.group_by] ?? (FIELD_LABELS[input.group_by] ?? input.group_by).toLowerCase();
      return `Počítám ${what} podle: ${by}`;
    },
    async run(input, ctx) {
      const teamById = await loadTeam(ctx);
      let items = await loadRows(ctx, {
        sections: allowedSections(ctx, input.sections),
        roles: input.roles?.length ? input.roles : ROLES,
        kinds: [input.kind],
        statuses: input.statuses?.length ? input.statuses : ['accepted'],
      });
      for (const filter of input.filters ?? []) {
        items = items.filter((item) => matchesFilter(item, filter, teamById));
      }

      if (input.group_by) {
        const counts = new Map();
        for (const item of items) {
          const values = fieldValues(item, input.group_by, teamById);
          for (const value of new Set(values.length ? values : ['(nevyplněno)'])) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
        }
        const groups = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([hodnota, pocet]) => ({ hodnota, pocet }));
        return { celkem: items.length, seskupeno_podle: input.group_by, skupiny: groups };
      }

      if (input.sort) {
        const direction = input.sort.direction === 'desc' ? -1 : 1;
        items.sort((a, b) => {
          const left = fieldValue(a, input.sort.field, teamById);
          const right = fieldValue(b, input.sort.field, teamById);
          const leftDate = parseDate(left);
          const rightDate = parseDate(right);
          if (leftDate && rightDate) return (leftDate - rightDate) * direction;
          return String(left ?? '').localeCompare(String(right ?? ''), 'cs', { numeric: true }) * direction;
        });
      }

      const limit = input.limit ?? 25;
      const extraFields = [...new Set([...(input.filters ?? []).map((filter) => filter.field), input.sort?.field].filter(Boolean))];
      return {
        celkem: items.length,
        zobrazeno: Math.min(limit, items.length),
        zaznamy: items.slice(0, limit).map((item) => {
          const record = compactRecord(item, teamById);
          for (const field of extraFields) {
            const value = fieldValue(item, field, teamById);
            if (!isEmptyValue(value)) record[field] = truncate(value, 160);
          }
          return record;
        }),
      };
    },
  },
  {
    name: 'get_subject',
    description:
      'Úplný profil jednoho subjektu: všechna vyplněná pole, jeho zakázky ve všech rolích a sekcích, poznámky a seznam dokumentů. ' +
      'Použij, když uživatel chce o subjektu vědět víc nebo shrnutí („co víme o Novák Stavby“). id a sekci/roli vezmi z ref výsledku search.',
    input: recordInput,
    label: () => 'Načítám profil subjektu',
    async run(input, ctx) {
      assertSection(ctx, input.section);
      const teamById = await loadTeam(ctx);
      const entity = await ctx.api.get(`${entitiesPath(input.section, input.role)}/${input.id}`);
      const resource = documentResource(input.section, input.role);
      const [roles, notes, documents] = await Promise.all([
        ctx.api.get(`/api/subject-link/status?namespace=${input.section}&type=${input.role}&id=${input.id}`).catch(() => null),
        ctx.api.get(`/${resource}/${input.id}/notes`).catch(() => []),
        ctx.api.get(`/${resource}/${input.id}/documents`).catch(() => []),
      ]);

      const zakazky = [];
      const dalsi_role = [];
      for (const roleId of ROLES) {
        const roleData = roles?.roles?.[roleId];
        for (const identity of roleData?.identities ?? []) {
          if (!identity.self) {
            dalsi_role.push({
              role: ROLE_LABELS[roleId],
              sekce: identity.namespaceLabel,
              kod: identity.entityCode,
              ref: recordRef({ section: identity.namespace, role: roleId, kind: 'subject', id: identity.entityInternalId }),
            });
          }
        }
        for (const commission of roleData?.commissions ?? []) {
          zakazky.push({
            ref: recordRef({ section: commission.namespace, role: roleId, kind: 'commission', id: commission.id }),
            kod: commission.commissionId,
            role: ROLE_LABELS[roleId],
            sekce: commission.namespaceLabel,
            nazev: commission.projectName || commission.position || commission.servicePosition || undefined,
            schvaleni: STATUS_LABELS[commission.status] ?? commission.status,
            stav: commission.state || undefined,
            odpovedny: (commission.assignedUserIds ?? []).map((id) => teamById.get(Number(id))?.username).filter(Boolean).join(', ') || commission.assignedTo || undefined,
          });
        }
      }

      const noteList = Array.isArray(notes) ? notes : [];
      const docList = (Array.isArray(documents) ? documents : []).filter((doc) => doc.itemKind !== 'folder');
      return {
        ref: recordRef({ ...input, kind: 'subject' }),
        sekce: SECTION_LABELS[input.section],
        role: ROLE_LABELS[input.role],
        nazev: subjectName(entity),
        pole: describeFields(entity, { kind: 'subject', teamById }),
        dalsi_role,
        zakazky,
        poznamky: noteList.slice(0, 15).map((note) => ({
          autor: note.author || undefined,
          datum: note.created_at ?? note.createdAt,
          text: truncate(note.content, 600),
        })),
        poznamek_celkem: noteList.length,
        dokumenty: docList.slice(0, 30).map((doc) => ({
          nazev: doc.filename,
          velikost_kb: Math.round((doc.sizeBytes ?? 0) / 1024),
          nahrano: doc.createdAt,
          archivovano: doc.archivedAt ? true : undefined,
        })),
        dokumentu_celkem: docList.length,
      };
    },
  },
  {
    name: 'get_commission',
    description:
      'Detail jedné zakázky: všechna pole, subjekt, ke kterému patří, a ostatní účastníci téže zakázky (propojení zakázky – klienti, partneři, tipaři). ' +
      'id a sekci/roli vezmi z ref výsledku search nebo get_subject.',
    input: recordInput,
    label: () => 'Načítám zakázku',
    async run(input, ctx) {
      assertSection(ctx, input.section);
      const teamById = await loadTeam(ctx);
      const commission = await ctx.api.get(`${commissionsPath(input.section, input.role)}/${input.id}`);
      const deal = await ctx.api
        .get(`/api/deal-link/status?namespace=${input.section}&type=${input.role}&id=${input.id}`)
        .catch(() => null);
      const ucastnici = [];
      for (const roleId of ROLES) {
        for (const slot of deal?.slots?.[roleId] ?? []) {
          if (!slot || (slot.namespace === input.section && roleId === input.role && slot.commissionInternalId === input.id)) continue;
          ucastnici.push({
            role: ROLE_LABELS[roleId],
            sekce: slot.namespaceLabel,
            subjekt: `${slot.entityCode ?? ''} ${slot.name ?? ''}`.trim(),
            zakazka: slot.commissionId,
            ref: recordRef({ section: slot.namespace, role: roleId, kind: 'commission', id: slot.commissionInternalId }),
          });
        }
      }
      return {
        ref: recordRef({ ...input, kind: 'commission' }),
        sekce: SECTION_LABELS[input.section],
        role: ROLE_LABELS[input.role],
        kod: commission.commission_id,
        pole: describeFields(commission, { kind: 'commission', teamById }),
        subjekt: {
          ref: recordRef({ section: input.section, role: input.role, kind: 'subject', id: commission.entity_id }),
          kod: commission.entity_code,
          nazev: subjectName(commission),
        },
        ucastnici_zakazky: ucastnici,
      };
    },
  },
  {
    name: 'list_team',
    description: 'Seznam uživatelů aplikace (id, jméno, role). Použij, když se ptá na kolegy nebo potřebuješ id uživatele pro jiný nástroj.',
    input: z.object({}).strict(),
    label: () => 'Načítám tým',
    async run(_input, ctx) {
      const teamById = await loadTeam(ctx);
      return { uzivatele: [...teamById.values()].map((user) => ({ id: user.id, jmeno: user.username, role: user.role })) };
    },
  },
  {
    name: 'recent_changes',
    description:
      'Historie změn v aplikaci: kdo co kdy vytvořil, upravil nebo smazal. Jen pro administrátory – u ostatních vrátí chybu. ' +
      'Použij pro otázky „co se dnes změnilo“, „kdo upravil klienta X“, „co dělal Petr tento týden“.',
    input: changesInput,
    label: () => 'Procházím historii změn',
    async run(input, ctx) {
      if (ctx.user.role !== 'admin') {
        throw new ToolError('Historie změn je dostupná jen administrátorům.');
      }
      const from = new Date(Date.now() - (input.hours ?? 24) * 3600 * 1000).toISOString();
      const params = new URLSearchParams({ limit: '30', from });
      if (input.query) params.set('q', input.query);
      if (input.user_id) params.set('userId', String(input.user_id));
      const page = await ctx.api.get(`/api/safety/changes?${params}`);
      return {
        akci: page.groups?.length ?? 0,
        akce: (page.groups ?? []).map((group) => ({
          kdy: group.at,
          kdo: group.actor?.type === 'ai_agent' ? `AI agent (za ${group.actor.name})` : group.actor?.name ?? 'Systém',
          zmen: group.size,
          zmeny: group.entries.slice(0, 8).map((entry) => ({
            typ: { I: 'vytvořeno', U: 'upraveno', D: 'smazáno' }[entry.op],
            co: `${entry.tableLabel} · ${entry.label ?? `#${entry.rowId}`}`,
            pole: entry.op === 'U' ? entry.changedFields.slice(0, 8) : undefined,
          })),
          vraceno: group.revertedCount > 0 || undefined,
        })),
      };
    },
  },
  {
    name: 'open_record',
    description:
      'Zobrazí uživateli tlačítko, které v aplikaci otevře profil subjektu nebo zakázky. ' +
      'Použij, když uživatel chce záznam otevřít/ukázat, nebo když odpověď míří na jeden konkrétní záznam. Neotevírá nic samo – jen nabídne tlačítko.',
    input: openInput,
    label: () => 'Připravuji odkaz',
    async run(input, ctx) {
      assertSection(ctx, input.section);
      const path = input.kind === 'subject' ? entitiesPath(input.section, input.role) : commissionsPath(input.section, input.role);
      const record = await ctx.api.get(`${path}/${input.id}`);
      const label = input.label
        || (input.kind === 'subject' ? `${record.entity_id ?? ''} · ${subjectName(record)}` : `${record.commission_id} · ${commissionName(record)}`);
      ctx.emitAction({
        type: 'open_record',
        section: input.section,
        role: input.role,
        kind: input.kind,
        id: input.id,
        entityId: input.kind === 'commission' ? record.entity_id : input.id,
        status: record.status ?? 'accepted',
        label: truncate(label, 120),
      });
      return { zobrazeno: true, popisek: label };
    },
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

// The definitions sent to the API. Built once: the tool list is part of the
// cached prompt prefix and must stay byte-identical between requests.
export const TOOL_DEFINITIONS = TOOLS.map((tool) => {
  const { $schema, ...schema } = z.toJSONSchema(tool.input);
  void $schema;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema,
    eager_input_streaming: true,
  };
});

export const toolLabel = (name, input) => {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return name;
  try {
    return tool.label(input ?? {});
  } catch {
    return name;
  }
};

// Run one tool call. Never throws: failures go back to the model as an error
// result it can react to.
export async function runTool(name, rawInput, ctx) {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return { isError: true, content: `Neznámý nástroj ${name}.` };
  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    return {
      isError: true,
      content: JSON.stringify({ INVALID_INPUT: rawInput, problem: z.prettifyError(parsed.error) }),
    };
  }
  try {
    const result = await tool.run(parsed.data, ctx);
    return { isError: false, content: JSON.stringify(result) };
  } catch (error) {
    if (error instanceof ToolError) return { isError: true, content: error.message };
    if (error?.status === 403) return { isError: true, content: 'Na tento záznam nebo sekci uživatel nemá přístup.' };
    if (error?.status === 404) return { isError: true, content: 'Záznam nenalezen.' };
    console.error(`Jarvis tool ${name} failed:`, error);
    return { isError: true, content: `Nástroj selhal: ${error.message}` };
  }
}
