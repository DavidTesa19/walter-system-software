import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../utils/api";
import type { FieldOption } from "../fieldOptions";

// Specialization ("Zaměření") options are scoped exactly like custom Obor
// options (standard / project / growth), but each option additionally belongs
// to a single Obor value. They start empty for every obor — the users build the
// catalog themselves, and anything they add stays available for that obor on
// every future subject in the same namespace.

type FieldOptionScope = "standard" | "project" | "growth";

type SpecializationOptionApi = {
  id: number;
  scope: FieldOptionScope;
  field_value: string;
  value: string;
  created_at?: string;
  updated_at?: string;
};

const normalizeScope = (systemNamespace?: string): FieldOptionScope => {
  if (systemNamespace === "projects") return "project";
  if (systemNamespace === "growth") return "growth";
  return "standard";
};

const toOption = (option: SpecializationOptionApi): FieldOption => ({
  id: option.id,
  value: option.value,
  label: option.value,
  isCustom: true,
});

const useFieldSpecializationOptions = (systemNamespace?: string) => {
  const scope = useMemo(() => normalizeScope(systemNamespace), [systemNamespace]);
  const [options, setOptions] = useState<SpecializationOptionApi[]>([]);

  const fetchOptions = useCallback(async () => {
    try {
      const response = await apiGet<SpecializationOptionApi[]>(
        `/field-specialization-options?scope=${scope}`
      );
      setOptions(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error("Error fetching specialization options:", error);
      setOptions([]);
    }
  }, [scope]);

  useEffect(() => {
    void fetchOptions();
  }, [fetchOptions]);

  // Index options by their obor value so the dropdown for each obor row shows
  // only that obor's specializations.
  const optionsByField = useMemo(() => {
    const map = new Map<string, FieldOption[]>();
    for (const option of options) {
      const key = option.field_value;
      const list = map.get(key) ?? [];
      list.push(toOption(option));
      map.set(key, list);
    }
    return map;
  }, [options]);

  const getOptionsForField = useCallback(
    (fieldValue: string): FieldOption[] => optionsByField.get(fieldValue) ?? [],
    [optionsByField]
  );

  const createSpecializationOption = useCallback(
    async (fieldValue: string, value: string): Promise<FieldOption> => {
      const created = await apiPost<SpecializationOptionApi>("/field-specialization-options", {
        scope,
        field: fieldValue,
        value,
      });
      setOptions((current) => [...current, created]);
      return toOption(created);
    },
    [scope]
  );

  const deleteSpecializationOption = useCallback(async (optionId: number) => {
    const deleted = await apiDelete<SpecializationOptionApi>(
      `/field-specialization-options/${optionId}`
    );
    setOptions((current) => current.filter((option) => option.id !== optionId));
    return deleted;
  }, []);

  return {
    getOptionsForField,
    createSpecializationOption,
    deleteSpecializationOption,
    refetchSpecializationOptions: fetchOptions,
  };
};

export default useFieldSpecializationOptions;
