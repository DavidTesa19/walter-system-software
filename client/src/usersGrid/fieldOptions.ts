export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldCategory {
  label: string;
  options: FieldOption[];
}

import rawGroupedFieldOptions from "./field-options.json";

type RawFieldCategory = {
  label: string;
  options: string[];
};

// Helper to create options
const createOption = (name: string) => ({ value: name, label: name });

const rawFieldCategories = rawGroupedFieldOptions as RawFieldCategory[];

export const groupedFieldOptions: FieldCategory[] = rawFieldCategories.map((group) => ({
  label: group.label,
  options: group.options.map(createOption)
}));

// Flat list for backward compatibility
// Using Set to ensure uniqueness in case of cross-categorization, though current categorization is strict
const uniqueOptions = new Map<string, FieldOption>();
groupedFieldOptions.forEach(group => {
  group.options.forEach(opt => {
    uniqueOptions.set(opt.value, opt);
  });
});

export const fieldOptions: FieldOption[] = Array.from(uniqueOptions.values()).sort((a, b) =>
  a.label.localeCompare(b.label, 'cs', { sensitivity: 'base' })
);

export const projectsFieldOptions: FieldOption[] = [
  { value: 'Banky', label: 'Banky' },
  { value: 'Developeři', label: 'Developeři' },
  { value: 'Firmy', label: 'Firmy' },
  { value: 'Fondy', label: 'Fondy' },
  { value: 'Instituce', label: 'Instituce' },
  { value: 'Investoři', label: 'Investoři' },
  { value: 'Ostatní', label: 'Ostatní' },
];

export const projectsGroupedFieldOptions: FieldCategory[] = [
  {
    label: 'Projektové obory',
    options: projectsFieldOptions,
  },
];