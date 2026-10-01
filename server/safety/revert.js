// Working out what undoing one change-log entry means, before touching anything.
//
// A revert never blindly writes the old values back: if someone changed the
// same field again afterwards, overwriting their edit silently would be a new
// accident. Such a field is reported as a conflict, and the admin decides
// whether to overwrite it anyway (`force`).

import { IGNORED_CHANGE_FIELDS, REDACTED_VALUE } from './tables.js';

const IGNORED = new Set([...IGNORED_CHANGE_FIELDS, 'id']);

export function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export const valuesEqual = (a, b) => stableStringify(a ?? null) === stableStringify(b ?? null);

const comparableKeys = (row) => Object.keys(row ?? {}).filter((key) => !IGNORED.has(key));

// Fields where `current` no longer matches `expected` (ignoring bookkeeping).
export function differingFields(expected, current) {
  return comparableKeys(expected).filter((key) =>
    key in (current ?? {}) && expected[key] !== REDACTED_VALUE && !valuesEqual(expected[key], current[key])
  );
}

/**
 * entry:   { id, op: 'I'|'U'|'D', table, rowId, oldData, newData, changedFields }
 * current: the row as it is now (same JSON shape as the log), or null
 *
 * Returns { action: 'noop'|'delete'|'update'|'insert'|'error', values?, conflicts, reason? }
 */
export function planEntryRevert(entry, current) {
  switch (entry.op) {
    case 'I': {
      if (!current) {
        return { action: 'noop', conflicts: [], reason: 'Záznam už neexistuje.' };
      }
      const conflicts = differingFields(entry.newData, current).map((field) => ({
        field,
        current: current[field],
        expected: entry.newData?.[field],
        target: null,
      }));
      return { action: 'delete', conflicts };
    }

    case 'U': {
      if (!current) {
        return {
          action: 'error',
          conflicts: [],
          reason: 'Záznam byl mezitím smazán. Nejdřív ho obnovte z koše.',
        };
      }
      const values = {};
      const conflicts = [];
      for (const field of entry.changedFields ?? []) {
        if (IGNORED.has(field) || !(field in (entry.oldData ?? {})) || !(field in current)) continue;
        // A password hash never enters the log, so there is nothing to put back.
        if (entry.oldData[field] === REDACTED_VALUE || entry.newData?.[field] === REDACTED_VALUE) continue;
        if (valuesEqual(current[field], entry.oldData[field])) continue;
        if (!valuesEqual(current[field], entry.newData?.[field])) {
          conflicts.push({ field, current: current[field], expected: entry.newData?.[field], target: entry.oldData[field] });
        }
        values[field] = entry.oldData[field];
      }
      if (Object.keys(values).length === 0) {
        return { action: 'noop', conflicts: [], reason: 'Hodnoty už odpovídají stavu před změnou.' };
      }
      return { action: 'update', values, conflicts };
    }

    case 'D': {
      if (current) {
        if (differingFields(entry.oldData, current).length === 0) {
          return { action: 'noop', conflicts: [], reason: 'Záznam už je obnovený.' };
        }
        return {
          action: 'error',
          conflicts: [],
          reason: `Záznam s ID ${entry.rowId} už znovu existuje s jiným obsahem.`,
        };
      }
      return { action: 'insert', values: entry.oldData, conflicts: [] };
    }

    default:
      return { action: 'error', conflicts: [], reason: `Neznámý typ změny ${entry.op}.` };
  }
}

/**
 * Restoring a record to the state it had right after `entry` (or right before
 * it, for a deletion). Unlike a revert this writes every field, not just the
 * ones that entry changed.
 */
export function planVersionRestore(entry, current) {
  const target = entry.op === 'D' ? entry.oldData : entry.newData;
  if (!target) {
    return { action: 'error', conflicts: [], reason: 'Tato verze záznamu není k dispozici.' };
  }
  if (!current) {
    return { action: 'insert', values: target, conflicts: [] };
  }
  const values = {};
  for (const field of comparableKeys(target)) {
    if (!(field in current)) continue;
    if (target[field] === REDACTED_VALUE) continue;
    if (!valuesEqual(current[field], target[field])) values[field] = target[field];
  }
  if (Object.keys(values).length === 0) {
    return { action: 'noop', conflicts: [], reason: 'Záznam už je v této verzi.' };
  }
  return { action: 'update', values, conflicts: [] };
}
