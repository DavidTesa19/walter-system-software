// Kvalita dat › "Doplnit z ARES" for many subjects at once: every subject with
// a valid IČO that lacks a company name or a Kraj gets what ARES says, one
// record at a time. Only empty fields (and the old "Nová Společnost" /
// "Nová Lokalita" defaults) are filled — the same changes the profile's
// "Doplnit z ARES" ticks by itself; nothing a person typed is overwritten.

import { applyAresFill, planAresFill, type AresFillSource } from '../usersGrid/aresFill';
import { readCompanyStructure, readRegionStructure } from '../usersGrid/hierarchy';
import { isValidIco, lookupAresCompany } from '../usersGrid/ico';
import { apiPut } from '../utils/api';
import { ROLE_LABELS, SECTION_LABELS, type RecordRef, type Section, type SectionData } from './dataQuality';

type Row = Record<string, unknown>;

export interface AresCandidate {
  ref: RecordRef;
  ico: string;
  source: AresFillSource;
}

export interface AresBulkResult {
  ref: RecordRef;
  outcome: 'filled' | 'nothing' | 'not_found' | 'failed';
  /** What was written, or why not. */
  detail: string;
}

const PLACEHOLDER_COMPANY = /^nov[áa] spole[čc]nost$/i;
const PLACEHOLDER_LOCATION = /^nov[áa] lokalita$/i;

const text = (value: unknown) => (value == null ? '' : String(value).trim());

// The row as the tree readers expect it (the API calls the company column
// company_name; the grid and hierarchy.ts call it company).
export const fillSourceOf = (row: Row): AresFillSource => ({
  company_structure: row.company_structure,
  company: row.company_name ?? row.company,
  field: row.field,
  field_specialization: row.field_specialization,
  region_structure: row.region_structure,
  region: row.region,
  location: row.location,
  location_geo: row.location_geo,
});

// The same rule the fill itself follows (aresFill.ts): a company is missing
// when none is named (or only the old default), Kraj / Lokalita only when
// both are empty. A Lokalita without a Kraj is someone's choice; the fill
// would only offer to add the sídlo next to it, never on its own, so such a
// subject is not listed (it would stay on the list forever).
const needsFill = (source: AresFillSource) => {
  const hasCompany = readCompanyStructure(source).some(
    (node) => node.company.trim() && !PLACEHOLDER_COMPANY.test(node.company.trim()),
  );
  const hasPlaces = readRegionStructure(source).some(
    (node) => node.region.trim() || node.locations.some((location) => location.trim() && !PLACEHOLDER_LOCATION.test(location.trim())),
  );
  return !hasCompany || !hasPlaces;
};

/** Subjects ARES could complete: a valid IČO, no real company or no Kraj, not archived. */
export function aresCandidates(data: SectionData[]): AresCandidate[] {
  const out: AresCandidate[] = [];
  for (const block of data) {
    for (const row of block.subjects) {
      if (text(row.status) === 'archived') continue;
      const ico = text(row.ico);
      if (!ico || !isValidIco(ico)) continue;
      const source = fillSourceOf(row);
      if (!needsFill(source)) continue;
      const id = Number(row.id);
      const code = text(row.entity_id);
      const name = text(row.company_name) || [text(row.first_name), text(row.last_name)].filter(Boolean).join(' ');
      out.push({
        ico,
        source,
        ref: {
          section: block.section,
          role: block.role,
          kind: 'subject',
          id,
          entityId: id,
          status: text(row.status) || 'accepted',
          label: [code, name].filter(Boolean).join(' · ') || `#${id}`,
        },
      });
    }
  }
  return out;
}

const entityPath = (section: Section, role: string, id: number) =>
  `${section === 'public' ? '/api' : `/api/${section}`}/${role}-entities/${id}`;

// The fill's grid keys as the API's columns.
const toApiColumns = (updates: Record<string, string | null>) =>
  Object.fromEntries(Object.entries(updates).map(([key, value]) => [key === 'company' ? 'company_name' : key, value]));

const describe = (changes: Array<{ label: string; to: string }>) => changes.map((change) => `${change.label}: ${change.to}`).join('; ');

/**
 * Fill the candidates one after another. `onProgress` gets each result as it
 * lands; `signal` stops before the next record (the current one finishes).
 */
export async function runAresBulk(
  candidates: AresCandidate[],
  { onProgress, signal }: { onProgress?: (done: number, result: AresBulkResult) => void; signal?: AbortSignal } = {},
): Promise<AresBulkResult[]> {
  const results: AresBulkResult[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (signal?.aborted) break;
    let result: AresBulkResult;
    try {
      const company = await lookupAresCompany(candidate.ico);
      const plan = planAresFill(company, candidate.source);
      // In bulk only the company and the address: a name or a note is a
      // choice to make per subject, in its profile.
      const selected = new Set(
        plan.changes.filter((change) => change.preselected && (change.id === 'company' || change.id === 'region')).map((change) => change.id),
      );
      const updates = applyAresFill(plan, selected, candidate.source);
      if (!updates) {
        result = { ref: candidate.ref, outcome: 'nothing', detail: 'Není co doplnit bez přepsání vyplněných údajů.' };
      } else {
        await apiPut(entityPath(candidate.ref.section, candidate.ref.role, candidate.ref.id), toApiColumns(updates));
        const written = plan.changes.filter((change) => selected.has(change.id));
        result = { ref: candidate.ref, outcome: 'filled', detail: describe(written) };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      result = /v ARES není|404/i.test(message)
        ? { ref: candidate.ref, outcome: 'not_found', detail: `IČO ${candidate.ico} v ARES není.` }
        : { ref: candidate.ref, outcome: 'failed', detail: message || 'Nepodařilo se.' };
    }
    results.push(result);
    onProgress?.(index + 1, result);
    // ARES is a public service: a short pause between records.
    if (index < candidates.length - 1) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return results;
}

export const candidateWhere = (ref: RecordRef) => `${ROLE_LABELS[ref.role]} · ${SECTION_LABELS[ref.section]}`;
