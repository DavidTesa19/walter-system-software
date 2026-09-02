import { apiGet, apiPost } from "../utils/api";
import type { LinkableNamespace } from "./sectionLink";

// Subject identity: the same real-world subject acting as Klient, Partner and/or
// Tipař. Each role is a separate entity record — in a separate table, with its
// own entity code — so a subject's commissions used to be visible only from the
// one section whose profile panel was open. `subject_id` groups those role
// records; these calls read the grouping, edit it, and move a commission from
// one of the subject's roles to another.
//
// It is the cross-ROLE twin of the section link (`link_id`, sectionLink.ts) and
// is unrelated to the deal link (`deal_id`, dealLink.ts), which joins DIFFERENT
// subjects taking part in one commission. See server/subject-identity.js.

export type SubjectRole = "client" | "partner" | "tiper";

export const SUBJECT_ROLES: SubjectRole[] = ["client", "partner", "tiper"];

export const SUBJECT_ROLE_LABELS: Record<SubjectRole, string> = {
  client: "Klient",
  partner: "Partner",
  tiper: "Tipař",
};

/** Accusative, for "Propojit ___" / "Vytvořit ___". */
export const SUBJECT_ROLE_AS_LABELS: Record<SubjectRole, string> = {
  client: "klienta",
  partner: "partnera",
  tiper: "tipaře",
};

/** What the role's records are called in the plural, for empty states. */
export const SUBJECT_ROLE_COMMISSION_LABELS: Record<SubjectRole, string> = {
  client: "zakázky",
  partner: "zakázky",
  tiper: "tipy",
};

/** One of the subject's role records. */
export interface SubjectIdentity {
  /** Stable key — internal ids repeat across tables and sections. */
  key: string;
  type: SubjectRole;
  namespace: LinkableNamespace;
  namespaceLabel: string;
  entityInternalId: number;
  entityCode: string | null;
  name: string | null;
  status: string;
  /** The record the profile panel is open on. */
  self: boolean;
}

/** One commission of the subject, in whichever role and section it sits. */
export interface SubjectCommission {
  id: number;
  commissionId: string;
  status: string;
  state: string | null;
  position: string | null;
  servicePosition: string | null;
  projectName: string | null;
  assignedTo: string | null;
  assignedUserIds: number[];
  dealId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  type: SubjectRole;
  namespace: LinkableNamespace;
  namespaceLabel: string;
  entityInternalId: number;
  entityCode: string | null;
  entityName: string | null;
  /** Belongs to the very record the panel is open on, so it is editable here. */
  self: boolean;
}

export interface SubjectRoleGroup {
  identities: SubjectIdentity[];
  commissions: SubjectCommission[];
}

export interface SubjectStatus {
  subjectId: string | null;
  ownType: SubjectRole;
  ownNamespace: LinkableNamespace;
  ownEntityInternalId: number;
  roles: Record<SubjectRole, SubjectRoleGroup>;
}

export interface SubjectMoveResult {
  moved: {
    type: SubjectRole;
    namespace: LinkableNamespace;
    namespaceLabel: string;
    commissionInternalId: number;
    commissionId: string;
    entityInternalId: number;
    entityCode: string | null;
    status: string;
  };
  subject: SubjectStatus;
}

const emptyGroup = (): SubjectRoleGroup => ({ identities: [], commissions: [] });

/**
 * Read a status payload into the shape the panel expects, filling in any role
 * the server left out — a client deployed ahead of its backend still renders
 * the roles it does get rather than breaking on a missing key.
 */
const normalizeSubjectStatus = (raw: unknown, fallback: {
  ownType: SubjectRole;
  ownNamespace: LinkableNamespace;
  ownEntityInternalId: number;
}): SubjectStatus => {
  const status = (raw ?? {}) as Partial<SubjectStatus> & { roles?: Partial<Record<SubjectRole, SubjectRoleGroup>> };
  const roles = {} as Record<SubjectRole, SubjectRoleGroup>;

  for (const role of SUBJECT_ROLES) {
    const group = status.roles?.[role];
    roles[role] = {
      identities: Array.isArray(group?.identities) ? group!.identities : [],
      commissions: Array.isArray(group?.commissions) ? group!.commissions : [],
    };
  }

  return {
    subjectId: status.subjectId ?? null,
    ownType: status.ownType ?? fallback.ownType,
    ownNamespace: status.ownNamespace ?? fallback.ownNamespace,
    ownEntityInternalId: status.ownEntityInternalId ?? fallback.ownEntityInternalId,
    roles,
  };
};

export const emptySubjectStatus = (
  ownType: SubjectRole,
  ownNamespace: LinkableNamespace,
  ownEntityInternalId: number
): SubjectStatus => ({
  subjectId: null,
  ownType,
  ownNamespace,
  ownEntityInternalId,
  roles: { client: emptyGroup(), partner: emptyGroup(), tiper: emptyGroup() },
});

interface SubjectRequest {
  namespace: LinkableNamespace;
  type: SubjectRole;
  /** Internal id of the subject record the panel is open on. */
  entityId: number;
  /** Approval status of the tab the panel was opened from; scopes the lists. */
  status?: string | null;
}

const fallbackFor = ({ namespace, type, entityId }: SubjectRequest) => ({
  ownType: type,
  ownNamespace: namespace,
  ownEntityInternalId: entityId,
});

export const getSubjectStatus = async (request: SubjectRequest): Promise<SubjectStatus> => {
  const params = new URLSearchParams({
    namespace: request.namespace,
    type: request.type,
    id: String(request.entityId),
  });
  if (request.status) params.set("status", request.status);
  return normalizeSubjectStatus(
    await apiGet<unknown>(`/api/subject-link/status?${params.toString()}`),
    fallbackFor(request)
  );
};

/** Bind an existing record of another role to this subject. */
export const attachSubjectIdentity = async (
  request: SubjectRequest,
  targetType: SubjectRole,
  targetNamespace: LinkableNamespace,
  targetEntityId: number
): Promise<SubjectStatus> =>
  normalizeSubjectStatus(
    await apiPost<unknown>("/api/subject-link/attach", {
      namespace: request.namespace,
      type: request.type,
      id: request.entityId,
      status: request.status ?? undefined,
      targetType,
      targetNamespace,
      targetEntityId,
    }),
    fallbackFor(request)
  );

/** Create this subject's record in another role and link it, in one step. */
export const createSubjectIdentity = async (
  request: SubjectRequest,
  targetType: SubjectRole,
  targetNamespace?: LinkableNamespace
): Promise<SubjectStatus> =>
  normalizeSubjectStatus(
    await apiPost<unknown>("/api/subject-link/create", {
      namespace: request.namespace,
      type: request.type,
      id: request.entityId,
      status: request.status ?? undefined,
      targetType,
      targetNamespace,
    }),
    fallbackFor(request)
  );

/** Drop one role record from the subject. The record itself is left alone. */
export const detachSubjectIdentity = async (
  request: SubjectRequest,
  targetType: SubjectRole,
  targetNamespace: LinkableNamespace,
  targetEntityId: number
): Promise<SubjectStatus> =>
  normalizeSubjectStatus(
    await apiPost<unknown>("/api/subject-link/detach", {
      namespace: request.namespace,
      type: request.type,
      id: request.entityId,
      status: request.status ?? undefined,
      targetType,
      targetNamespace,
      targetEntityId,
    }),
    fallbackFor(request)
  );

/**
 * Move one commission to another role of the same subject. `request` names the
 * record the panel is open on; `commission` names the side the commission
 * currently sits on, which may be another role and another section. The target
 * record is created and linked on the fly when the subject has none in that
 * role yet.
 */
export const moveCommissionToRole = async (
  request: SubjectRequest,
  commission: { namespace: LinkableNamespace; type: SubjectRole; id: number },
  targetType: SubjectRole,
  targetNamespace?: LinkableNamespace
): Promise<SubjectMoveResult> => {
  const result = await apiPost<SubjectMoveResult>("/api/subject-link/move-commission", {
    namespace: request.namespace,
    type: request.type,
    id: request.entityId,
    commissionNamespace: commission.namespace,
    commissionType: commission.type,
    commissionId: commission.id,
    status: request.status ?? undefined,
    targetType,
    targetNamespace: targetNamespace ?? commission.namespace,
  });
  return {
    ...result,
    subject: normalizeSubjectStatus(result?.subject, fallbackFor(request)),
  };
};
