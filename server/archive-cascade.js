// Which subject types follow their last commission into the archive.
//
// Archiving a commission archives its subject too, but only once that subject
// has no commission left that is not archived. Only clients work that way: a
// client is there for the work, so once none is left there is nothing to keep
// them in the active table for. Partners and tipers are standing relationships
// that outlive any single commission, so having no open commission is not a
// reason to file one away — they are archived by hand.
//
// Applies to the public tables and to the projects and growth namespaces alike,
// and is shared by both servers so the two cannot drift apart.
const AUTO_ARCHIVE_SUBJECT_TYPES = new Set(['client']);

export const cascadesArchiveToSubject = (type) => AUTO_ARCHIVE_SUBJECT_TYPES.has(type);
