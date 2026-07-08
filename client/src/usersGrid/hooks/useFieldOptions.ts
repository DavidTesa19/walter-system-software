import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../utils/api";
import {
  fieldOptions as fixedStandardFieldOptions,
  groupedFieldOptions as fixedStandardGroupedFieldOptions,
  projectsFieldOptions as fixedProjectFieldOptions,
  projectsGroupedFieldOptions as fixedProjectGroupedFieldOptions,
} from "../fieldOptions";
import type { FieldCategory, FieldOption } from "../fieldOptions";

type FieldOptionScope = "standard" | "project" | "growth";

type FieldOptionApi = {
  id: number;
  scope: FieldOptionScope;
  value: string;
  created_at?: string;
  updated_at?: string;
};

const CUSTOM_FIELD_CATEGORY_LABEL = "Přidané";

const toCustomFieldOption = (option: FieldOptionApi): FieldOption => ({
  id: option.id,
  value: option.value,
  label: option.value,
  isCustom: true,
});

const normalizeScope = (systemNamespace?: string): FieldOptionScope => {
  if (systemNamespace === "projects") return "project";
  if (systemNamespace === "growth") return "growth";
  return "standard";
};

const buildGroupedFieldOptions = (
  scope: FieldOptionScope,
  customFieldOptions: FieldOption[]
): FieldCategory[] => {
  if (scope === "project") {
    return [
      {
        label: fixedProjectGroupedFieldOptions[0]?.label ?? "Projektové obory",
        options: [...fixedProjectFieldOptions, ...customFieldOptions],
      },
    ];
  }

  return customFieldOptions.length > 0
    ? [
        ...fixedStandardGroupedFieldOptions,
        {
          label: CUSTOM_FIELD_CATEGORY_LABEL,
          options: customFieldOptions,
        },
      ]
    : fixedStandardGroupedFieldOptions;
};

const buildFlatFieldOptions = (scope: FieldOptionScope, customFieldOptions: FieldOption[]): FieldOption[] => (
  scope === "project"
    ? [...fixedProjectFieldOptions, ...customFieldOptions]
    : [...fixedStandardFieldOptions, ...customFieldOptions]
);

const useFieldOptions = (systemNamespace?: string) => {
  const scope = useMemo(() => normalizeScope(systemNamespace), [systemNamespace]);
  const [customFieldOptions, setCustomFieldOptions] = useState<FieldOption[]>([]);

  const fetchFieldOptions = useCallback(async () => {
    try {
      const response = await apiGet<FieldOptionApi[]>(`/field-options?scope=${scope}`);
      setCustomFieldOptions((Array.isArray(response) ? response : []).map(toCustomFieldOption));
    } catch (error) {
      console.error("Error fetching field options:", error);
      setCustomFieldOptions([]);
    }
  }, [scope]);

  useEffect(() => {
    void fetchFieldOptions();
  }, [fetchFieldOptions]);

  const createFieldOption = useCallback(async (value: string) => {
    const created = await apiPost<FieldOptionApi>("/field-options", { scope, value });
    const nextOption = toCustomFieldOption(created);
    setCustomFieldOptions((current) => [...current, nextOption]);
    return nextOption;
  }, [scope]);

  const deleteFieldOption = useCallback(async (optionId: number) => {
    const deleted = await apiDelete<FieldOptionApi>(`/field-options/${optionId}`);
    setCustomFieldOptions((current) => current.filter((option) => option.id !== optionId));
    return deleted;
  }, []);

  const fieldOptions = useMemo(
    () => buildFlatFieldOptions(scope, customFieldOptions),
    [customFieldOptions, scope]
  );

  const groupedFieldOptions = useMemo(
    () => buildGroupedFieldOptions(scope, customFieldOptions),
    [customFieldOptions, scope]
  );

  const fieldOptionsArray = useMemo(
    () => fieldOptions.map((option) => option.value),
    [fieldOptions]
  );

  return {
    fieldOptions,
    groupedFieldOptions,
    fieldOptionsArray,
    createFieldOption,
    deleteFieldOption,
    refetchFieldOptions: fetchFieldOptions,
  };
};

export default useFieldOptions;