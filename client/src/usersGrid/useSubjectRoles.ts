import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SUBJECT_ROLES,
  SUBJECT_ROLE_AS_LABELS,
  SUBJECT_ROLE_COMMISSION_LABELS,
  SUBJECT_ROLE_LABELS,
  attachSubjectIdentity,
  createSubjectIdentity,
  detachSubjectIdentity,
  emptySubjectStatus,
  getSubjectStatus,
  moveCommissionToRole,
  syncSubjectSharedFields,
  type SubjectCommission,
  type SubjectRole,
  type SubjectStatus,
} from "./subjectLink";
import { fetchSubjectOptionsAcrossSections, type DealSubjectOption } from "./dealLink";
import type { LinkableNamespace } from "./sectionLink";
import { useSubjectNavigation } from "../utils/subjectNavigation";
import type {
  LinkedCommissionItem,
  SubjectRoleCommissionView,
  SubjectRoleTableView,
  SubjectRolesConfig,
} from "./components/EntityCommissionProfilePanel";

interface UseSubjectRolesArgs {
  /** The subject type of the section this panel lives in. */
  ownType: SubjectRole;
  linkableNamespace: LinkableNamespace | null;
  selectedEntityId: number | null;
  /** Approval status of the current tab; scopes every role's list to it. */
  status: string;
  /** The panel's own live list, so an edit here shows before the refetch lands. */
  linkedCommissions: LinkedCommissionItem[];
  selectedCommissionId: number | null;
  onSelectCommission?: (commissionId: number) => void;
  /** Renders the "Bez názvu ..." fallback title the section already uses. */
  untitledLabel: string;
  /**
   * Turns a commission's assignment into the same text the section's own list
   * shows. Foreign rows carry ids rather than names, so the section's user list
   * has to do the formatting.
   */
  formatAssigned?: (assignedUserIds: number[] | null, fallback: string | null) => string;
  readOnly?: boolean;
  /** Called after a move, so the section can refresh its grid. */
  onChanged?: () => void | Promise<void>;
}

const buildSubtitle = (
  commission: SubjectCommission,
  formatAssigned?: UseSubjectRolesArgs["formatAssigned"]
): string | null => [
  commission.servicePosition,
  formatAssigned
    ? formatAssigned(commission.assignedUserIds ?? null, commission.assignedTo)
    : commission.assignedTo,
].filter(Boolean).join(" • ") || null;

const buildTitle = (commission: SubjectCommission, untitledLabel: string): string =>
  commission.position || commission.projectName || untitledLabel;

/**
 * Wires the "Zakázky subjektu" tables: the subject's records in all three roles
 * and every commission hanging off them, plus the actions that bind a record to
 * the subject, create one, and move a commission from one role to another.
 *
 * A subject is stored once per role, so the panel is only ever open on one of
 * those records. Its own role's list therefore comes from the section's live
 * state (which reflects an edit before the refetch lands) and everything else
 * from the server, merged here so the panel just renders.
 */
export const useSubjectRoles = ({
  ownType,
  linkableNamespace,
  selectedEntityId,
  status,
  linkedCommissions,
  selectedCommissionId,
  onSelectCommission,
  untitledLabel,
  formatAssigned,
  readOnly = false,
  onChanged,
}: UseSubjectRolesArgs): SubjectRolesConfig | null => {
  const navigate = useSubjectNavigation();
  const [subject, setSubject] = useState<SubjectStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyRole, setBusyRole] = useState<SubjectRole | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [options, setOptions] = useState<Partial<Record<SubjectRole, DealSubjectOption[]>>>({});
  const [optionsLoading, setOptionsLoading] = useState<SubjectRole | null>(null);

  const request = useMemo(
    () => (linkableNamespace && selectedEntityId !== null
      ? { namespace: linkableNamespace, type: ownType, entityId: selectedEntityId, status }
      : null),
    [linkableNamespace, ownType, selectedEntityId, status]
  );

  // Keeps the reload callback stable while still seeing the latest request.
  const requestRef = useRef(request);
  requestRef.current = request;

  const reload = useCallback(async () => {
    const current = requestRef.current;
    if (!current) {
      setSubject(null);
      return;
    }
    try {
      setSubject(await getSubjectStatus(current));
    } catch (error) {
      console.error("Error fetching subject roles:", error);
      // An unreachable status endpoint must not blank the panel: fall back to
      // the empty grouping, which still renders the section's own role.
      setSubject(emptySubjectStatus(current.type, current.namespace, current.entityId));
    }
  }, []);

  useEffect(() => {
    if (!request) {
      setSubject(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getSubjectStatus(request)
      .then((result) => {
        if (!cancelled) setSubject(result);
      })
      .catch((error) => {
        console.error("Error fetching subject roles:", error);
        if (!cancelled) setSubject(emptySubjectStatus(request.type, request.namespace, request.entityId));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  // The pickable records of one role, loaded only when its picker is opened —
  // three sections' worth of subjects is too much to fetch on every panel open.
  const loadOptions = useCallback((role: SubjectRole) => {
    setOptions((previous) => {
      if (previous[role]) return previous;
      setOptionsLoading(role);
      fetchSubjectOptionsAcrossSections(role)
        .then((loaded) => setOptions((current) => ({ ...current, [role]: loaded })))
        .catch((error) => {
          console.error(`Error loading ${role} records for subject link:`, error);
          setOptions((current) => ({ ...current, [role]: [] }));
        })
        .finally(() => setOptionsLoading((current) => (current === role ? null : current)));
      return previous;
    });
  }, []);

  const runRoleAction = useCallback(
    async (role: SubjectRole, action: () => Promise<SubjectStatus>, failureMessage: string) => {
      setBusyRole(role);
      try {
        setSubject(await action());
        if (onChanged) await onChanged();
      } catch (error) {
        console.error(failureMessage, error);
        alert(failureMessage);
      } finally {
        setBusyRole(null);
      }
    },
    [onChanged]
  );

  const handleLink = useCallback(
    (role: SubjectRole, targetNamespace: LinkableNamespace, targetEntityId: number) => {
      const current = requestRef.current;
      if (!current) return;
      void runRoleAction(
        role,
        () => attachSubjectIdentity(current, role, targetNamespace, targetEntityId),
        "Propojení subjektu se nepodařilo vytvořit."
      );
    },
    [runRoleAction]
  );

  const handleCreate = useCallback(
    (role: SubjectRole) => {
      const current = requestRef.current;
      if (!current) return;
      if (!window.confirm(
        `Vytvořit tento subjekt i jako ${SUBJECT_ROLE_AS_LABELS[role]}? Vznikne nový záznam v sekci ${SUBJECT_ROLE_LABELS[role]}, propojený s tímto subjektem.`
      )) return;
      void runRoleAction(
        role,
        () => createSubjectIdentity(current, role),
        `Záznam ${SUBJECT_ROLE_AS_LABELS[role]} se nepodařilo vytvořit.`
      );
    },
    [runRoleAction]
  );

  // Manual "push now": re-send this record's own contacts/location onto every
  // other role/section record of the subject. Edits already do this on their
  // own (see server's propagateSubjectFieldSync); this is for catching up a
  // record that was just attached, or one edited before the auto-sync shipped.
  const handleSync = useCallback(() => {
    const current = requestRef.current;
    if (!current) return;
    if (!window.confirm(
      "Přepsat kontakty a lokalitu (Kraj, Lokalita) u všech propojených záznamů tohoto subjektu hodnotami z tohoto záznamu? Obor a Zaměření se nepřenáší."
    )) return;
    setSyncing(true);
    syncSubjectSharedFields(current)
      .then(async (result) => {
        setSubject(result);
        if (onChanged) await onChanged();
      })
      .catch((error) => {
        console.error("Error syncing subject fields:", error);
        alert("Sdílené údaje se nepodařilo rozeslat.");
      })
      .finally(() => setSyncing(false));
  }, [onChanged]);

  const handleUnlink = useCallback(
    (role: SubjectRole, targetNamespace: LinkableNamespace, targetEntityId: number, label: string) => {
      const current = requestRef.current;
      if (!current) return;
      if (!window.confirm(
        `Odpojit ${label} od tohoto subjektu? Záznam ani jeho zakázky se nesmažou, jen přestanou patřit k tomuto subjektu.`
      )) return;
      void runRoleAction(
        role,
        () => detachSubjectIdentity(current, role, targetNamespace, targetEntityId),
        "Propojení subjektu se nepodařilo zrušit."
      );
    },
    [runRoleAction]
  );

  const handleMove = useCallback(
    (commission: { namespace: LinkableNamespace; type: SubjectRole; id: number; commissionId: string }, targetRole: SubjectRole) => {
      const current = requestRef.current;
      if (!current) return;

      // Name the record the zakázka will land under. Without it the move reads
      // as "it vanished" — especially when the target record sits in another
      // section than the one being looked at.
      const identities = subject?.roles?.[targetRole]?.identities ?? [];
      const target = identities.find((identity) => identity.namespace === commission.namespace) ?? identities[0];
      const destination = target
        ? `pod záznam ${target.entityCode ?? ''}${target.name ? ` — ${target.name}` : ''} (sekce ${target.namespaceLabel})`
        : `pod nový záznam ${SUBJECT_ROLE_AS_LABELS[targetRole]}, který se subjektu automaticky vytvoří a propojí`;

      if (!window.confirm(
        `Přesunout zakázku ${commission.commissionId} na stranu ${SUBJECT_ROLE_LABELS[targetRole]}?

`
        + `Zakázka zmizí ze strany ${SUBJECT_ROLE_LABELS[commission.type]} a přejde ${destination}. `
        + `Dostane nové číslo a pole, která cílová strana nemá (např. Název projektu), se nepřenesou. `
        + `Propojení zakázky i stav schválení zůstávají.`
      )) return;

      setBusyRole(commission.type);
      moveCommissionToRole(current, commission, targetRole)
        .then(async (result) => {
          setSubject(result.subject);
          if (onChanged) await onChanged();
        })
        .catch((error) => {
          console.error("Error moving commission between subject roles:", error);
          alert("Zakázku se nepodařilo přesunout.");
          void reload();
        })
        .finally(() => setBusyRole(null));
    },
    [onChanged, reload, subject]
  );

  return useMemo<SubjectRolesConfig | null>(() => {
    if (!request) return null;

    const identityKeys = new Set(
      SUBJECT_ROLES.flatMap((role) =>
        (subject?.roles?.[role]?.identities ?? []).map((identity) => `${identity.namespace}:${identity.entityInternalId}`)
      )
    );

    const tables: SubjectRoleTableView[] = SUBJECT_ROLES.map((role) => {
      const group = subject?.roles?.[role] ?? { identities: [], commissions: [] };
      const own = role === request.type;

      // The panel's own record leads its role's list from live section state; the
      // server's copy of those same rows would lag an edit by a refetch.
      const ownItems: SubjectRoleCommissionView[] = own
        ? linkedCommissions.map((item) => ({
          key: `own:${item.id}`,
          commissionId: item.commission_id,
          status: item.status,
          title: item.title,
          subtitle: item.subtitle ?? null,
          own: true,
          selected: selectedCommissionId === item.id,
          onOpen: () => onSelectCommission?.(item.id),
          moveTargets: readOnly
            ? []
            : SUBJECT_ROLES.filter((target) => target !== role).map((target) => ({
              role: target,
              label: SUBJECT_ROLE_LABELS[target],
              onMove: () => handleMove(
                { namespace: request.namespace, type: role, id: item.id, commissionId: item.commission_id },
                target
              ),
            })),
        }))
        : [];

      const foreignItems: SubjectRoleCommissionView[] = group.commissions
        // The panel's own record is already covered by the live list above.
        .filter((commission) => !(own && commission.self))
        .map((commission) => ({
          key: `${commission.namespace}:${commission.type}:${commission.id}`,
          commissionId: commission.commissionId,
          status: commission.status,
          title: buildTitle(commission, untitledLabel),
          subtitle: buildSubtitle(commission, formatAssigned),
          namespaceLabel: commission.namespace !== request.namespace ? commission.namespaceLabel : null,
          entityCode: commission.entityCode,
          own: false,
          selected: false,
          onOpen: () => navigate?.({
            namespace: commission.namespace,
            type: commission.type,
            status: commission.status,
            entityInternalId: commission.entityInternalId,
            commissionInternalId: commission.id,
          }),
          moveTargets: readOnly
            ? []
            : SUBJECT_ROLES.filter((target) => target !== commission.type).map((target) => ({
              role: target,
              label: SUBJECT_ROLE_LABELS[target],
              onMove: () => handleMove(
                { namespace: commission.namespace, type: commission.type, id: commission.id, commissionId: commission.commissionId },
                target
              ),
            })),
        }));

      return {
        role,
        label: SUBJECT_ROLE_LABELS[role],
        own,
        identities: group.identities.map((identity) => ({
          key: identity.key,
          code: identity.entityCode,
          name: identity.name,
          namespaceLabel: identity.namespace !== request.namespace ? identity.namespaceLabel : null,
          self: identity.self,
          // The record the panel is open on cannot unlink itself — it would be
          // left looking at a group it is no longer part of.
          onUnlink: identity.self || readOnly
            ? undefined
            : () => handleUnlink(
              role,
              identity.namespace,
              identity.entityInternalId,
              `${identity.entityCode ?? ''}${identity.name ? ` — ${identity.name}` : ''}` || 'záznam'
            ),
        })),
        items: [...ownItems, ...foreignItems],
        addLabel: SUBJECT_ROLE_AS_LABELS[role],
        itemsLabel: SUBJECT_ROLE_COMMISSION_LABELS[role],
        busy: busyRole === role,
        // A record already in the group is not offered again.
        linkOptions: (options[role] ?? []).filter((option) => !identityKeys.has(option.key)),
        linkOptionsLoading: optionsLoading === role,
        onLoadLinkOptions: () => loadOptions(role),
        onLink: readOnly ? undefined : (namespace, entityId) => handleLink(role, namespace, entityId),
        // Creating a second record of a role the subject already has would just
        // split its commissions in two, so the button is offered only when empty.
        onCreate: readOnly || group.identities.length > 0 ? undefined : () => handleCreate(role),
      };
    });

    return {
      tables,
      loading,
      // The push-now button only means something once another role/section
      // record actually exists to receive it — the subject's own record is
      // always in `identityKeys`, so more than one means it is really linked.
      canSyncSharedFields: !readOnly && identityKeys.size > 1,
      syncingSharedFields: syncing,
      onSyncSharedFields: readOnly ? undefined : handleSync,
    };
  }, [
    request,
    subject,
    loading,
    linkedCommissions,
    selectedCommissionId,
    onSelectCommission,
    untitledLabel,
    formatAssigned,
    readOnly,
    busyRole,
    syncing,
    handleSync,
    options,
    optionsLoading,
    loadOptions,
    handleLink,
    handleCreate,
    handleUnlink,
    handleMove,
    navigate,
  ]);
};

export default useSubjectRoles;
