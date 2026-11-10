import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEAL_TYPES,
  DEAL_TYPE_AS_LABELS,
  DEAL_TYPE_LABELS,
  attachDeal,
  detachDeal,
  fetchSubjectOptionsAcrossSections,
  getDealStatus,
  type DealStatus,
  type DealSubjectOption,
  type DealType,
} from "./dealLink";
import type { LinkableNamespace } from "./sectionLink";
import type { DealLinkConfig, DealMemberView, DealSlotView } from "./components/EntityCommissionProfilePanel";

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
 * commission, loads the selectable subjects, and exposes attach/detach
 * handlers. Returns the DealLinkConfig for the profile panel, or null when
 * there's nothing to link (no commission / non-linkable section).
 *
 * A deal holds any number of participants of each type, so every type — the
 * commission's own included — offers a picker and lists what is already on the
 * deal.
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
  const requestedTypes = useRef(new Set<DealType>());

  // The selectable subjects of a type, from every section (a participant can
  // be picked out of any of the three), loaded the first time that type's
  // picker opens. It used to load all three types — nine full subject lists —
  // whenever a table opened, picker used or not.
  useEffect(() => {
    requestedTypes.current = new Set();
    setOptionsByType({});
  }, [linkableNamespace]);

  const loadOptions = useCallback((type: DealType) => {
    if (requestedTypes.current.has(type)) return;
    requestedTypes.current.add(type);
    const requestedFor = requestedTypes.current;
    fetchSubjectOptionsAcrossSections(type)
      .catch((error) => {
        console.error(`Error loading ${type} subjects for deal link:`, error);
        return [] as DealSubjectOption[];
      })
      .then((options) => {
        // Dropped when the section changed meanwhile.
        if (requestedTypes.current === requestedFor) {
          setOptionsByType((current) => ({ ...current, [type]: options }));
        }
      });
  }, []);

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
    async (targetType: DealType, targetNamespace: LinkableNamespace, targetEntityId: number) => {
      if (!linkableNamespace || !selectedCommissionId) return;
      setBusyType(targetType);
      try {
        const result = await attachDeal(
          linkableNamespace,
          ownType,
          selectedCommissionId,
          targetType,
          targetNamespace,
          targetEntityId
        );
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
    async (
      targetType: DealType,
      targetCommissionId: number,
      targetNamespace: LinkableNamespace
    ) => {
      if (!linkableNamespace || !selectedCommissionId) return;
      setBusyType(targetType);
      try {
        const result = await detachDeal(
          linkableNamespace,
          ownType,
          selectedCommissionId,
          targetType,
          targetCommissionId,
          targetNamespace
        );
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
      const isOwnType = type === ownType;
      const dealSlots = status?.slots?.[type] ?? [];

      const members: DealMemberView[] = dealSlots.map((slot) => {
        // The commission the panel is open on: it is on the deal by definition
        // and leaves it by dropping the others, so it carries no remove button.
        const self = isOwnType
          && slot.namespace === linkableNamespace
          && slot.commissionInternalId === selectedCommissionId;

        return {
          key: `${slot.namespace}:${slot.commissionInternalId}`,
          code: slot.entityCode,
          name: slot.name,
          commissionId: slot.commissionId,
          // Only worth showing when the participant sits in a different section
          // than the commission being edited — otherwise it's noise on every row.
          namespaceLabel: slot.namespace !== linkableNamespace ? slot.namespaceLabel : null,
          self,
          onDetach: self
            ? undefined
            : () => handleDetach(type, slot.commissionInternalId, slot.namespace),
        };
      });

      // A subject joins a deal once, so the ones already on it are not offered
      // again — including this commission's own subject.
      const attached = new Set(
        dealSlots
          .filter((slot) => slot.entityInternalId !== null)
          .map((slot) => `${slot.namespace}:${slot.entityInternalId}`)
      );

      return {
        type,
        label: DEAL_TYPE_LABELS[type],
        addLabel: DEAL_TYPE_AS_LABELS[type],
        self: isOwnType,
        members,
        options: (optionsByType[type] ?? []).filter((option) => !attached.has(option.key)),
        optionsLoading: !optionsByType[type],
        onOpenPicker: () => loadOptions(type),
        busy: busyType === type,
        onAttach: (targetNamespace: LinkableNamespace, entityId: number) =>
          handleAttach(type, targetNamespace, entityId),
      };
    });

    return { slots };
  }, [linkableNamespace, selectedCommissionId, status, ownType, optionsByType, busyType, handleAttach, handleDetach, loadOptions]);
};
