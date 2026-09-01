/**
 * Server-side maintenance of the nested subject trees.
 *
 * The trees themselves are owned by the client (see `client/src/usersGrid/
 * hierarchy.ts`); the server only needs to keep `company_structure` honest when
 * an entry it references disappears from a shared catalog:
 *
 *   • an Obor option is deleted   -> the obor is renamed inside every tree
 *   • a Zaměření option is deleted -> the zaměření is cleared inside every tree
 *
 * Without this the flat mirror columns would be cleaned up while the tree kept
 * the dangling value, and the tree — which wins on read — would put it straight
 * back.
 *
 * Every function takes and returns the stored representation (a JSON array
 * string, or null) and returns its input unchanged when there is nothing to do,
 * so callers can skip the write.
 */

const parseStructure = (raw) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const serializeStructure = (nodes) => (nodes.length === 0 ? null : JSON.stringify(nodes));

/** Rename one obor value everywhere it appears in a company tree. */
export function renameFieldInCompanyStructure(raw, fromValue, toValue) {
  const nodes = parseStructure(raw);
  if (!nodes) return raw;

  let changed = false;
  const next = nodes.map((node) => ({
    ...node,
    fields: (Array.isArray(node?.fields) ? node.fields : []).map((entry) => {
      if (!entry || typeof entry !== 'object' || entry.field !== fromValue) return entry;
      changed = true;
      return { ...entry, field: toValue };
    }),
  }));

  return changed ? serializeStructure(next) : raw;
}

/** Clear one zaměření value from every obor in a company tree that has it. */
export function removeSpecializationFromCompanyStructure(raw, fieldValue, specializationValue) {
  const nodes = parseStructure(raw);
  if (!nodes) return raw;

  let changed = false;
  const next = nodes.map((node) => ({
    ...node,
    fields: (Array.isArray(node?.fields) ? node.fields : []).map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      if (entry.field !== fieldValue || entry.specialization !== specializationValue) return entry;
      changed = true;
      return { ...entry, specialization: '' };
    }),
  }));

  return changed ? serializeStructure(next) : raw;
}
