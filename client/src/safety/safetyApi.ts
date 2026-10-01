import { API_BASE, apiDelete, apiGet, apiPost, apiPut } from '../utils/api';

export type ActorType = 'user' | 'ai_agent' | 'public' | 'system';
export type ChangeOp = 'I' | 'U' | 'D';

export interface Actor {
  type: ActorType;
  userId: number | null;
  name: string | null;
}

export interface ChangeEntry {
  id: number;
  at: string;
  table: string;
  tableLabel: string;
  rowId: string;
  op: ChangeOp;
  label: string | null;
  changedFields: string[];
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  actor: Actor;
  changesetId: string;
  route: string | null;
  note: string | null;
  reverts: string | null;
  reverted: { at: string; by: string | null; changesetId: string } | null;
}

export interface ChangeGroup {
  changesetId: string;
  lastId: number;
  size: number;
  at: string;
  endedAt: string;
  actor: Actor;
  route: string | null;
  note: string | null;
  reverts: string | null;
  revertedCount: number;
  entries: ChangeEntry[];
}

export interface ChangeFilters {
  q?: string;
  actorType?: ActorType | '';
  userId?: string;
  op?: ChangeOp | '';
  kind?: 'subject' | 'commission' | '';
  table?: string;
  rowId?: string;
  from?: string;
  to?: string;
  changesetId?: string;
}

export interface ConflictField {
  field: string;
  current: unknown;
  expected: unknown;
  target: unknown;
}

export interface RevertProblem {
  auditId: number;
  op?: ChangeOp;
  table: string;
  tableLabel: string;
  rowId: string;
  label: string | null;
  reason?: string;
  fields?: ConflictField[];
}

export interface RevertResult {
  ok: boolean;
  changesetId?: string;
  applied: number;
  skipped: number;
  conflicts: RevertProblem[];
  errors: RevertProblem[];
}

export interface TrashItem {
  auditId: number;
  table: string;
  tableLabel: string;
  rowId: string;
  label: string | null;
  hidden: boolean;
}

export interface TrashGroup {
  changesetId: string;
  at: string;
  actor: Actor;
  route: string | null;
  items: TrashItem[];
  headline: TrashItem;
  counts: Record<string, number>;
  auditIds: number[];
}

export interface RecordHistory {
  table: string;
  tableLabel: string;
  rowId: string;
  label: string | null;
  exists: boolean;
  current: Record<string, unknown> | null;
  entries: ChangeEntry[];
}

export type BackupKind = 'daily' | 'weekly' | 'monthly' | 'safety' | 'manual';

export interface Backup {
  id: number;
  kind: BackupKind;
  kindLabel: string;
  status: 'running' | 'ok' | 'failed';
  note: string | null;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  tableCounts: Record<string, number> | null;
  sizeBytes: number | null;
  fileCount: number | null;
  fileBytes: number | null;
  offsiteStatus: 'ok' | 'partial' | 'failed' | 'disabled' | null;
  offsiteError: string | null;
  encrypted: boolean;
  storedInDatabase: boolean;
  checksum: string | null;
  error: string | null;
}

export interface BackupConfig {
  offsite: { configured: boolean; bucket?: string; endpointHost?: string; prefix?: string };
  encryption: boolean;
  retentionDays: Record<BackupKind, number | null>;
  alwaysKeepLatest: number;
  schedule: { enabled: boolean; hour: number; timeZone: string };
}

export interface RestoreGroup {
  id: string;
  label: string;
  description: string;
  defaultSelected: boolean;
}

export interface RestoreResult {
  dryRun: boolean;
  backupId: number;
  safetyBackupId: number | null;
  tables: Array<{ table: string; label: string; inserted: number; updated: number; deleted: number }>;
  totals: { inserted: number; updated: number; deleted: number };
  missingFiles: Array<{ id: number; filename: string }>;
}

export interface SafetySettings {
  ai_writes_enabled: boolean;
  ai_allow_hard_delete: boolean;
  ai_max_rows_per_run: number;
}

export interface SafetyStatus {
  available: boolean;
  reason?: string;
  install?: {
    installedAt: string | null;
    auditedTables: number;
    dropGuard: string;
    agentReadonlyRole: string;
    errors: string[];
  };
  summary?: {
    lastDay: number;
    lastWeek: number;
    deletesWeek: number;
    agentRuns: number;
    total: number;
    oldest: string | null;
  };
  settings?: SafetySettings;
  backups?: {
    config: BackupConfig;
    latest: Backup | null;
    lastSuccessful: Backup | null;
    lastFailed: Backup | null;
  };
  auditRetentionDays?: number;
}

const query = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

// Revert and restore answer 409 with a body that lists the conflicts, which
// the shared helpers would turn into a bare Error. Read the body ourselves.
const postAllowingConflict = async <T>(endpoint: string, body: unknown): Promise<T> => {
  const stored = localStorage.getItem('walterUser');
  const token = stored ? (JSON.parse(stored).token as string | undefined) : undefined;
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok || (response.status === 409 && Array.isArray(data?.conflicts))) return data as T;
  throw new Error(data?.error || `Požadavek selhal (${response.status})`);
};

export const safetyApi = {
  status: () => apiGet<SafetyStatus>('/api/safety/status'),
  changes: (filters: ChangeFilters, before?: number | null) =>
    apiGet<{ groups: ChangeGroup[]; nextBefore: number | null }>(
      `/api/safety/changes${query({ ...filters, before: before ?? undefined })}`
    ),
  actors: () => apiGet<Array<{ id: number | null; name: string | null; type: ActorType; changes: number }>>('/api/safety/actors'),
  recordHistory: (table: string, rowId: string) =>
    apiGet<RecordHistory>(`/api/safety/records/${encodeURIComponent(table)}/${encodeURIComponent(rowId)}`),
  restoreVersion: (table: string, rowId: string, auditId: number) =>
    postAllowingConflict<RevertResult>(
      `/api/safety/records/${encodeURIComponent(table)}/${encodeURIComponent(rowId)}/restore`,
      { auditId }
    ),
  revert: (body: { auditIds?: number[]; changesetId?: string; force?: boolean }) =>
    postAllowingConflict<RevertResult>('/api/safety/revert', body),
  trash: (q?: string, before?: number | null) =>
    apiGet<{ groups: TrashGroup[]; nextBefore: number | null }>(`/api/safety/trash${query({ q, before })}`),
  settings: () => apiGet<SafetySettings>('/api/safety/settings'),
  updateSettings: (patch: Partial<SafetySettings>) => apiPut<SafetySettings>('/api/safety/settings', patch),
  backups: () =>
    apiGet<{ backups: Backup[]; config: BackupConfig; groups: RestoreGroup[] }>('/api/safety/backups'),
  createBackup: (note?: string) => apiPost<{ started: boolean }>('/api/safety/backups', { note }),
  testOffsite: () => apiPost<{ ok: boolean; bucket: string; endpointHost: string; encryption: boolean }>('/api/safety/backups/test-offsite'),
  restoreBackup: (id: number, body: { groups: string[]; dryRun: boolean; confirm?: string }) =>
    apiPost<RestoreResult>(`/api/safety/backups/${id}/restore`, body),
  deleteBackup: (id: number) => apiDelete<{ deleted: number }>(`/api/safety/backups/${id}`),
};
