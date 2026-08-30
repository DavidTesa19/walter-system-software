// Which subject types follow their last commission into the archive.
//
// Archiving a commission archives its subject too, but only once that subject
// has no commission left that is not archived. Partners are deliberately left
// out: a partner is a standing relationship that outlives any single
// commission, so having no open commission is not a reason to file one away.
// Partners are archived by hand.
//
// Applies to the public tables and to the projects and growth namespaces alike,
// and is shared by both servers so the two cannot drift apart.
const AUTO_ARCHIVE_SUBJECT_TYPES = new Set(['client', 'tiper']);

export const cascadesArchiveToSubject = (type) => AUTO_ARCHIVE_SUBJECT_TYPES.has(type);
