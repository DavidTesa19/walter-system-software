import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEAL_TYPES,
  DEAL_TYPE_LABELS,
  attachDeal,
  detachDeal,
  fetchSubjectOptions,
  getDealStatus,
  type DealStatus,
  type DealSubjectOption,
  type DealType,
} from "./dealLink";
import type { LinkableNamespace } from "./sectionLink";
import type { DealLinkConfig, DealSlotView } from "./components/EntityCommissionProfilePanel";

interface UseDealLinkArgs {
  // The subject type of the section this commission lives in.
  ownType: DealType;
  linkableNamespace: LinkableNamespace | null;
  selectedCommissionId: number | null;
  // Included in the effect deps so an external change to the deal re-fetches.
  selectedCommissionDealId?: string | null;
  // Called after a successful attach/detach so the section can refresh its grid.
  onChanged?: () => void | Promise<void>;
}

/**
 * Wires the "Propojení zakázky" panel: loads the deal status for the selected
 * commission, loads the selectable counterparty subjects, and exposes
 * attach/detach handlers. Returns the DealLinkConfig for the profile panel, or
 * null when there's nothing to link (no commission / non-linkable section).
 */
export const useDealLink = ({
  ownType,
  linkableNamespace,
  selectedCommissionId,
  selectedCommissionDealId,
  onChanged,
}: UseDealLinkArgs): DealLinkConfig | null => {
  const [status, setStatus] = useState<DealStatus | null>(null);
  const [busyType, setBusyType] = useState<DealType | null>(null);
  const [optionsByType, setOptionsByType] = useState<Partial<Record<DealType, DealSubjectOption[]>>>({});

  const otherTypes = useMemo(() => DEAL_TYPES.filter((type) => type !== ownType), [ownType]);

  // Load the selectable subjects for the two counterparty types.
  useEffect(() => {
    if (!linkableNamespace) {
      setOptionsByType({});
      return;
    }
    let cancelled = false;
    Promise.all(
      otherTypes.map((type) =>
        fetchSubjectOptions(linkableNamespace, type)
          .then((options) => [type, options] as const)
          .catch((error) => {
            console.error(`Error loading ${type} subjects for deal link:`, error);
            return [type, [] as DealSubjectOption[]] as const;
          })
      )
    ).then((pairs) => {
      if (!cancelled) {
        setOptionsByType(Object.fromEntries(pairs) as Partial<Record<DealType, DealSubjectOption[]>>);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [linkableNamespace, otherTypes]);

  // Load the deal status for the selected commission.
  useEffect(() => {
    if (!linkableNamespace || !selectedCommissionId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    getDealStatus(linkableNamespace, ownType, selectedCommissionId)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((error) => {
        console.error("Error fetching deal-link status:", error);
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [linkableNamespace, ownType, selectedCommissionId, selectedCommissionDealId]);

  const handleAttach = useCallback(
    async (targetType: DealType, targetEntityId: number) => {
      if (!linkableNamespace || !selectedCommissionId) return;
      setBusyType(targetType);
      try {
        const result = await attachDeal(linkableNamespace, ownType, selectedCommissionId, targetType, targetEntityId);
        setStatus(result);
        if (onChanged) await onChanged();
      } catch (error) {
        console.error("Error attaching deal link:", error);
        alert("Propojení se nepodařilo vytvořit.");
      } finally {
        setBusyType(null);
      }
    },
    [linkableNamespace, ownType, selectedCommissionId, onChanged]
  );

  const handleDetach = useCallback(
    async (targetType: DealType) => {
      if (!linkableNamespace || !selectedCommissionId) return;
      setBusyType(targetType);
      try {
        const result = await detachDeal(linkableNamespace, ownType, selectedCommissionId, targetType);
        setStatus(result);
        if (onChanged) await onChanged();
      } catch (error) {
        console.error("Error detaching deal link:", error);
        alert("Propojení se nepodařilo zrušit.");
      } finally {
        setBusyType(null);
      }
    },
    [linkableNamespace, ownType, selectedCommissionId, onChanged]
  );

  return useMemo<DealLinkConfig | null>(() => {
    if (!linkableNamespace || !selectedCommissionId) return null;
    const slots: DealSlotView[] = DEAL_TYPES.map((type) => {
      const slot = status?.slots?.[type] ?? null;
      const self = type === ownType;
      return {
        type,
        label: DEAL_TYPE_LABELS[type],
        self,
        linkedCode: slot?.entityCode ?? null,
        linkedName: slot?.name ?? null,
        linkedCommissionId: slot?.commissionId ?? null,
        options: self ? [] : (optionsByType[type] ?? []).map((option) => ({ id: option.id, label: option.label })),
        busy: busyType === type,
        onAttach: (entityId: number) => handleAttach(type, entityId),
        onDetach: () => handleDetach(type),
      };
    });
    return { slots };
  }, [linkableNamespace, selectedCommissionId, status, ownType, optionsByType, busyType, handleAttach, handleDetach]);
};
