// Analýza › Dokumenty: the pure part. GET /api/documents/overview
// (server/documents/overview.js) sends every file; grouping, filtering,
// sorting, duplicates and costs are worked out here.

export type FileKind = 'pdf' | 'image' | 'word' | 'excel' | 'presentation' | 'archive' | 'text' | 'other';
export type DocumentSection = 'public' | 'projects' | 'growth' | 'future' | 'unknown';
export type DocumentRole = 'client' | 'partner' | 'tiper' | null;

export interface OverviewDocument {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string | null;
  folder: string;
  createdAt: string | null;
  archivedAt: string | null;
  noteId: number | null;
  uploadedBy: string | null;
  entityType: string;
  entityId: number;
  section: DocumentSection;
  role: DocumentRole;
  owner: { label: string; status: string | null; exists: boolean };
}

export interface DeletedDocument {
  auditId: number;
  filename: string | null;
  sizeBytes: number;
  storedBytes: number;
  entityType: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface DocumentsOverview {
  documents: OverviewDocument[];
  folderCount: number;
  deleted: DeletedDocument[];
  storage: {
    databaseBytes: number;
    documentsBytes: number;
    deletedBytes: number;
    backupsBytes: number;
    offsiteFileBytes: number;
    offsiteFileCount: number;
    offsiteArchiveBytes: number;
    source: 'postgres' | 'json';
  };
  cost: { disk: number; offsite: number; total: number; usdCzk: number; rateDate: string | null };
  prices: { railwayDiskUsdPerGbMonth: number; railwayRamUsdPerGbMonth: number; r2UsdPerGbMonth: number; r2FreeGb: number };
  generatedAt: string;
}

export const KIND_LABELS: Record<FileKind, string> = {
  pdf: 'PDF',
  image: 'Obrázky',
  word: 'Word a texty',
  excel: 'Tabulky',
  presentation: 'Prezentace',
  archive: 'Archivy (ZIP…)',
  text: 'Textové soubory',
  other: 'Ostatní',
};

export const SECTION_LABELS: Record<DocumentSection, string> = {
  public: 'Veřejné',
  projects: 'Neveřejné',
  growth: 'Growth Club',
  future: 'Budoucí funkce',
  unknown: 'Neznámé',
};

export const ROLE_LABELS: Record<Exclude<DocumentRole, null>, string> = {
  client: 'Klient',
  partner: 'Partner',
  tiper: 'Tipař',
};

const EXTENSION_KINDS: Array<[RegExp, FileKind]> = [
  [/\.pdf$/i, 'pdf'],
  [/\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?|svg)$/i, 'image'],
  [/\.(docx?|odt|rtf|pages)$/i, 'word'],
  [/\.(xlsx?|xlsm|ods|csv|numbers)$/i, 'excel'],
  [/\.(pptx?|odp|key)$/i, 'presentation'],
  [/\.(zip|rar|7z|tar|gz|tgz)$/i, 'archive'],
  [/\.(txt|md|json|xml|eml|msg)$/i, 'text'],
];

export function fileKind(mimeType: string | null | undefined, filename: string | null | undefined): FileKind {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || mime.includes('opendocument.text')) return 'word';
  if (mime.includes('spreadsheetml') || mime === 'application/vnd.ms-excel' || mime === 'text/csv') return 'excel';
  if (mime.includes('presentationml') || mime === 'application/vnd.ms-powerpoint') return 'presentation';
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('x-7z') || mime.includes('x-rar')) return 'archive';
  const name = filename ?? '';
  for (const [pattern, kind] of EXTENSION_KINDS) if (pattern.test(name)) return kind;
  if (mime.startsWith('text/')) return 'text';
  return 'other';
}

// "0 B", "820 kB", "1,4 MB", "1,02 GB" (binary units, Czech decimal comma).
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : unit >= 3 ? 2 : 1;
  return `${value.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: digits })} ${units[unit]}`;
}

export function formatCzk(value: number): string {
  const digits = Math.abs(value) < 10 ? 2 : 0;
  return `${value.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits })} Kč`;
}

const GB = 1024 ** 3;

// What keeping `bytes` on Railway's disk costs a month, in CZK.
export const diskCostCzk = (bytes: number, overview: Pick<DocumentsOverview, 'prices' | 'cost'>): number =>
  (bytes / GB) * overview.prices.railwayDiskUsdPerGbMonth * overview.cost.usdCzk;

// The same files held in Postgres's memory (what the nightly backup used to
// cause before 2026-11): RAM is billed ~65× the disk price.
export const memoryCostCzk = (bytes: number, overview: Pick<DocumentsOverview, 'prices' | 'cost'>): number =>
  (bytes / GB) * overview.prices.railwayRamUsdPerGbMonth * overview.cost.usdCzk;

// Files stored more than once (same content). `copies` counts every copy,
// `wastedBytes` all but one of them.
export interface DuplicateGroup {
  sha256: string;
  ids: number[];
  sizeBytes: number;
  wastedBytes: number;
}

export function findDuplicates(documents: OverviewDocument[]): { groups: DuplicateGroup[]; byId: Map<number, DuplicateGroup>; wastedBytes: number } {
  const bySha = new Map<string, OverviewDocument[]>();
  for (const doc of documents) {
    if (!doc.sha256 || doc.sizeBytes === 0) continue;
    const list = bySha.get(doc.sha256);
    if (list) list.push(doc);
    else bySha.set(doc.sha256, [doc]);
  }
  const groups: DuplicateGroup[] = [];
  const byId = new Map<number, DuplicateGroup>();
  for (const [sha256, docs] of bySha) {
    if (docs.length < 2) continue;
    const group = { sha256, ids: docs.map((doc) => doc.id), sizeBytes: docs[0].sizeBytes, wastedBytes: docs[0].sizeBytes * (docs.length - 1) };
    groups.push(group);
    for (const doc of docs) byId.set(doc.id, group);
  }
  groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  return { groups, byId, wastedBytes: groups.reduce((sum, group) => sum + group.wastedBytes, 0) };
}

export type StateFilter = 'all' | 'active' | 'archived';
export type SizeFilter = 0 | 1 | 5 | 20; // at least N MB

export interface DocumentFilters {
  query: string;
  kind: FileKind | 'all';
  section: DocumentSection | 'all';
  state: StateFilter;
  minMb: SizeFilter;
  duplicatesOnly: boolean;
  owner: string | null; // `${entityType}:${entityId}`
}

export const EMPTY_FILTERS: DocumentFilters = {
  query: '',
  kind: 'all',
  section: 'all',
  state: 'all',
  minMb: 0,
  duplicatesOnly: false,
  owner: null,
};

export const ownerKey = (doc: Pick<OverviewDocument, 'entityType' | 'entityId'>) => `${doc.entityType}:${doc.entityId}`;

// Lower case without accents, so "smlouva" finds "Smlouva č. 2".
export const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterDocuments(documents: OverviewDocument[], filters: DocumentFilters, duplicates: Map<number, DuplicateGroup>): OverviewDocument[] {
  const words = fold(filters.query).split(/\s+/).filter(Boolean);
  const minBytes = filters.minMb * 1024 * 1024;
  return documents.filter((doc) => {
    if (filters.kind !== 'all' && fileKind(doc.mimeType, doc.filename) !== filters.kind) return false;
    if (filters.section !== 'all' && doc.section !== filters.section) return false;
    if (filters.state === 'active' && doc.archivedAt) return false;
    if (filters.state === 'archived' && !doc.archivedAt) return false;
    if (minBytes > 0 && doc.sizeBytes < minBytes) return false;
    if (filters.duplicatesOnly && !duplicates.has(doc.id)) return false;
    if (filters.owner && ownerKey(doc) !== filters.owner) return false;
    if (words.length > 0) {
      const haystack = fold(`${doc.filename} ${doc.folder} ${doc.owner.label} ${doc.uploadedBy ?? ''}`);
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
}

export type SortKey = 'filename' | 'kind' | 'size' | 'owner' | 'section' | 'createdAt';
export type SortDirection = 'asc' | 'desc';

const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true });

export function sortDocuments(documents: OverviewDocument[], key: SortKey, direction: SortDirection): OverviewDocument[] {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a: OverviewDocument, b: OverviewDocument): number => {
    switch (key) {
      case 'size':
        return a.sizeBytes - b.sizeBytes;
      case 'createdAt':
        return (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
      case 'kind':
        return collator.compare(KIND_LABELS[fileKind(a.mimeType, a.filename)], KIND_LABELS[fileKind(b.mimeType, b.filename)]);
      case 'owner':
        return collator.compare(a.owner.label, b.owner.label);
      case 'section':
        return collator.compare(SECTION_LABELS[a.section], SECTION_LABELS[b.section]);
      default:
        return collator.compare(a.filename, b.filename);
    }
  };
  // Ties fall back to the largest file first, then the id, so the order is stable.
  return [...documents].sort((a, b) => sign * compare(a, b) || b.sizeBytes - a.sizeBytes || a.id - b.id);
}

export interface Group {
  key: string;
  label: string;
  count: number;
  bytes: number;
}

export function groupBy(documents: OverviewDocument[], keyOf: (doc: OverviewDocument) => string, labelOf: (doc: OverviewDocument) => string): Group[] {
  const groups = new Map<string, Group>();
  for (const doc of documents) {
    const key = keyOf(doc);
    const group = groups.get(key) ?? { key, label: labelOf(doc), count: 0, bytes: 0 };
    group.count += 1;
    group.bytes += doc.sizeBytes;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes || b.count - a.count);
}

// Czech plural: 1 soubor, 2–4 soubory, 0 / 5+ souborů.
const plural = (count: number, one: string, few: string, many: string) =>
  `${count.toLocaleString('cs-CZ')} ${count === 1 ? one : count >= 2 && count <= 4 ? few : many}`;
export const filesLabel = (count: number) => plural(count, 'soubor', 'soubory', 'souborů');
export const foldersLabel = (count: number) => plural(count, 'složka', 'složky', 'složek');
