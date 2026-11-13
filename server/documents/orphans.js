// Analýza › Dokumenty › Soubory bez subjektu: files whose subject was deleted
// (or lives only in a pre-2026 table) can be moved to an existing subject or
// deleted, a whole former subject at a time. Admin only; the writes go
// through the request's pool checkout, so the change log records who did it
// and every step can be reverted (Bezpečnost a zálohy).
//
// Moving keeps the folder tree: the former subject's folders and files change
// owner together. When it had files outside a single top folder, they are
// wrapped in a new folder named after it, so subjects do not mix in the target.

// Upload names that went through latin1 before 2026-11 ("RuskaÌ LOI naÌvrh")
// become UTF-8 again ("Ruská LOI návrh"). Only a clean result is taken: some
// names were mangled another way and would come out as "Z†mek".
const PLAUSIBLE = /^[\p{L}\p{N}\p{M}\s!-/:-@[-`{-~°–—„“”‘’…]+$/u;
export function repairFilename(name) {
  const value = String(name ?? '');
  if (!/[\u0080-ÿ]/.test(value) || /[^\u0000-ÿ]/.test(value)) return value;
  const decoded = Buffer.from(value, 'latin1').toString('utf8').normalize('NFC');
  if (decoded.includes('�') || decoded === value || !PLAUSIBLE.test(decoded)) return value;
  return decoded;
}

/**
 * How one former subject's documents move: which top items get a new
 * wrapper folder (and its name), and which names get repaired.
 * docs: every document (files and folders) of that former owner.
 */
export function planOwnerMove(docs, { fallbackName, repairNames = true }) {
  const ids = new Set(docs.map((doc) => Number(doc.id)));
  const roots = docs.filter((doc) => doc.parent_id == null || !ids.has(Number(doc.parent_id)));
  const rootFolders = roots.filter((doc) => doc.item_kind === 'folder');
  const needsWrapper = !(roots.length === 1 && rootFolders.length === 1);
  const folderNames = rootFolders.map((doc) => (repairNames ? repairFilename(doc.filename) : doc.filename));
  let wrapperName = null;
  if (needsWrapper) {
    wrapperName = folderNames.length > 0 ? folderNames.join(', ') : fallbackName;
    if (wrapperName.length > 120) wrapperName = `${wrapperName.slice(0, 117)}…`;
  }
  const renames = repairNames
    ? docs.map((doc) => ({ id: Number(doc.id), filename: repairFilename(doc.filename) })).filter((item, index) => item.filename !== docs[index].filename)
    : [];
  return { wrapperName, rootIds: needsWrapper ? roots.map((doc) => Number(doc.id)) : [], renames };
}

// "project-clients:25" → { entityType, entityId }
export function parseOwnerKey(key) {
  const match = /^([a-z-]+):(\d+)$/.exec(String(key ?? ''));
  return match ? { entityType: match[1], entityId: Number(match[2]) } : null;
}

export class OrphanError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
