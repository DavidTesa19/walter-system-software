import { useEffect, useSyncExternalStore } from 'react';
import type { JarvisRole, JarvisSection } from './jarvisApi';

// What the user has open right now, so "tenhle klient" means something to
// Jarvis. The section grids report their open profile panel here; the Jarvis
// panel reads it and sends it with every question.

export interface JarvisFocusRecord {
  section: JarvisSection;
  role: JarvisRole;
  kind: 'subject' | 'commission';
  id: number;
  label: string;
}

export interface JarvisFocus {
  subject: JarvisFocusRecord;
  // The zakázka selected in that subject's profile, if any.
  commission: JarvisFocusRecord | null;
}

let current: JarvisFocus | null = null;
let currentOwner: symbol | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useJarvisFocus = () => useSyncExternalStore(subscribe, () => current);

export const sectionFromNamespace = (namespace?: string): JarvisSection =>
  namespace === 'growth' ? 'growth' : namespace ? 'projects' : 'public';

type Named = {
  id: number;
  company?: string | null;
  company_name?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export const subjectLabel = (code: string, row: Named) => {
  const person = row.name || [row.first_name, row.last_name].filter(Boolean).join(' ');
  const name = (row.company || row.company_name || person || '').trim();
  return name ? `${code} · ${name}` : code;
};

type CommissionNamed = {
  project_name?: string | null;
  position?: string | null;
  service_position?: string | null;
  field?: string | null;
};

export const commissionLabel = (code: string, row: CommissionNamed) => {
  const name = (row.project_name || row.position || row.service_position || row.field || '').trim();
  return name ? `${code} · ${name}` : code;
};

// The focus for a section grid's open profile panel.
export function buildJarvisFocus(
  namespace: string | undefined,
  role: JarvisRole,
  entity: (Named & { entity_id: string }) | null,
  commission: (CommissionNamed & { id: number; commission_id: string }) | null
): JarvisFocus | null {
  if (!entity) return null;
  const section = sectionFromNamespace(namespace);
  const subject = subjectLabel(entity.entity_id, entity);
  // An unnamed zakázka is only a code; the subject's name makes it recognisable.
  const commissionText = commission ? commissionLabel(commission.commission_id, commission) : '';
  return {
    subject: { section, role, kind: 'subject', id: entity.id, label: subject },
    commission: commission
      ? {
          section,
          role,
          kind: 'commission',
          id: commission.id,
          label: commissionText === commission.commission_id && subject !== entity.entity_id
            ? `${commission.commission_id} · ${subject.slice(entity.entity_id.length + 3)}`
            : commissionText,
        }
      : null,
  };
}

// Called by a section grid with its open profile (or null). Each grid owns
// its report: a grid that closes its panel or unmounts clears only its own,
// never one another grid reported since.
export function useReportJarvisFocus(focus: JarvisFocus | null, active: boolean) {
  const key = focus && active
    ? `${focus.subject.section}/${focus.subject.role}/${focus.subject.id}/${focus.subject.label}|${focus.commission?.id ?? ''}/${focus.commission?.label ?? ''}`
    : '';

  useEffect(() => {
    if (!key || !focus) return undefined;
    const owner = Symbol('jarvis-focus');
    current = focus;
    currentOwner = owner;
    emit();
    return () => {
      if (currentOwner !== owner) return;
      current = null;
      currentOwner = null;
      emit();
    };
    // `key` captures everything about `focus` that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
