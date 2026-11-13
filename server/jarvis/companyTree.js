// The company tree (Společnost → Obor → Zaměření) for Jarvis's Obor
// proposals: read off a subject as the API returns it, add an obor, and write
// back the tree with its flat mirrors, exactly as the profile panel does.
//
// A port of client/src/usersGrid/hierarchy.ts (parseCompanyStructure,
// readCompanyStructure, serializeCompanyStructure, companyStructureUpdates)
// and multiValue.ts. Keep them in step: the client reads what this writes.

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

export const parseMultiValue = (raw) => {
  if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((value) => String(value).trim()).filter(Boolean);
    } catch {
      // A plain value that happens to start with "[".
    }
  }
  return [text];
};

export const serializeMultiValue = (values) => {
  const unique = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text && !unique.includes(text)) unique.push(text);
  }
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  return JSON.stringify(unique);
};

const parseSpecializationMap = (raw) => {
  let source = raw;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text.startsWith('{')) return {};
    try {
      source = JSON.parse(text);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const k = String(key).trim();
    const v = String(value ?? '').trim();
    if (k && v) out[k] = v;
  }
  return out;
};

const serializeSpecializationMap = (map) => {
  const clean = parseSpecializationMap(map);
  return Object.keys(clean).length === 0 ? null : JSON.stringify(clean);
};

const parseStructureArray = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim().startsWith('[')) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseCompanyStructure = (raw) =>
  parseStructureArray(raw)
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      company: trimmed(entry.company),
      fields: (Array.isArray(entry.fields) ? entry.fields : [])
        .map((field) =>
          typeof field === 'string'
            ? { field: field.trim(), specialization: '' }
            : field && typeof field === 'object'
              ? { field: trimmed(field.field), specialization: trimmed(field.specialization) }
              : null
        )
        .filter((field) => field && field.field),
    }));

/**
 * The company tree of a subject as the API returns it (company_name,
 * field, field_specialization, company_structure): tree first, reconciled
 * against the flat mirrors, like the client's readCompanyStructure.
 */
export function readCompanyTree(record) {
  const companies = parseMultiValue(record?.company_name ?? record?.company);
  const fields = parseMultiValue(record?.field);
  const specMap = parseSpecializationMap(record?.field_specialization);
  const stored = parseCompanyStructure(record?.company_structure);

  const storedByCompany = new Map();
  for (const node of stored) if (!storedByCompany.has(node.company)) storedByCompany.set(node.company, node);

  const placed = new Set();
  const takeFields = (node) => {
    const kept = [];
    for (const entry of node?.fields ?? []) {
      if (!fields.includes(entry.field) || kept.some((existing) => existing.field === entry.field)) continue;
      kept.push({ field: entry.field, specialization: entry.specialization || specMap[entry.field] || '' });
      placed.add(entry.field);
    }
    return kept;
  };

  const nodes = companies.map((company) => ({ company, fields: takeFields(storedByCompany.get(company)) }));
  const unnamedFields = takeFields(storedByCompany.get(''));
  if (unnamedFields.length > 0) nodes.push({ company: '', fields: unnamedFields });

  const orphans = fields.filter((field) => !placed.has(field)).map((field) => ({ field, specialization: specMap[field] || '' }));
  if (orphans.length > 0) {
    if (nodes.length === 0) nodes.push({ company: '', fields: orphans });
    else nodes[0].fields.push(...orphans.filter((orphan) => !nodes[0].fields.some((entry) => entry.field === orphan.field)));
  }
  return nodes;
}

const serializeCompanyStructure = (nodes) => {
  const clean = [];
  const seenCompanies = new Set();
  for (const node of nodes) {
    const company = trimmed(node.company);
    if (seenCompanies.has(company)) continue;
    const fields = [];
    const seenFields = new Set();
    for (const entry of node.fields ?? []) {
      const field = trimmed(entry.field);
      if (!field || seenFields.has(field)) continue;
      seenFields.add(field);
      fields.push({ field, specialization: trimmed(entry.specialization) });
    }
    if (!company && fields.length === 0) continue;
    seenCompanies.add(company);
    clean.push({ company, fields });
  }
  return clean.length === 0 ? null : JSON.stringify(clean);
};

/** The update a tree edit sends: the tree and its mirrors, in API column names. */
export function companyTreeUpdates(nodes) {
  const specMap = {};
  for (const node of nodes) {
    for (const entry of node.fields ?? []) {
      if (entry.field && entry.specialization && !specMap[entry.field]) specMap[entry.field] = entry.specialization;
    }
  }
  return {
    company_structure: serializeCompanyStructure(nodes),
    company_name: serializeMultiValue(nodes.map((node) => node.company)),
    field: serializeMultiValue(nodes.flatMap((node) => (node.fields ?? []).map((entry) => entry.field))),
    field_specialization: serializeSpecializationMap(specMap),
  };
}

/**
 * The tree with an obor added (or its zaměření set) under one company: the
 * named one, else the first branch, else a new unnamed branch.
 */
export function withObor(nodes, { obor, specialization = '', company = '' }) {
  const next = nodes.map((node) => ({ ...node, fields: (node.fields ?? []).map((entry) => ({ ...entry })) }));
  const target =
    (company && next.find((node) => node.company.toLocaleLowerCase('cs') === company.toLocaleLowerCase('cs'))) ||
    next[0] ||
    null;
  const branch = target ?? { company: '', fields: [] };
  if (!target) next.push(branch);
  const existing = branch.fields.find((entry) => entry.field === obor);
  if (existing) existing.specialization = specialization || existing.specialization;
  else branch.fields.push({ field: obor, specialization });
  return next;
}

/** "Automatizace (RPA), Fintech" — what a tree's obors read as on a card. */
export const describeObors = (nodes) => {
  const parts = nodes.flatMap((node) =>
    (node.fields ?? []).map((entry) => (entry.specialization ? `${entry.field} (${entry.specialization})` : entry.field))
  );
  return parts.length ? parts.join(', ') : '—';
};
