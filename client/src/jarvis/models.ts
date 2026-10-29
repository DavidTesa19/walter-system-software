// The models Jarvis can answer with. 'auto' lets the server match each question
// to one (server/jarvis/models.js); the others are a manual choice.

export type ModelChoice = 'auto' | 'opus' | 'sonnet' | 'haiku';

export const MODEL_CHOICES: Array<{ value: ModelChoice; label: string; hint: string }> = [
  {
    value: 'auto',
    label: 'Automaticky',
    hint: 'Jednoduché dotazy jdou na Haiku, změny a hledání na webu na Sonnet, náročné úkoly na Opus.',
  },
  { value: 'opus', label: 'Opus 5.5', hint: 'Nejchytřejší, ale nejdražší. Pro náročnou analýzu a dokumenty.' },
  { value: 'sonnet', label: 'Sonnet 5.5', hint: 'Vyvážený: dobrý na změny, hledání a běžné dotazy.' },
  { value: 'haiku', label: 'Haiku 5.5', hint: 'Nejrychlejší a nejlevnější. Na krátké dotazy na jeden údaj.' },
];

const NAMES: Record<string, string> = {
  'claude-opus-5-5': 'Opus 5.5',
  'claude-sonnet-5-5': 'Sonnet 5.5',
  'claude-haiku-5-5': 'Haiku 5.5',
};

export const modelLabel = (modelId: string) => NAMES[modelId] ?? modelId;

export const MODEL_CHOICE_KEY = 'walterJarvisModel';

export const readModelChoice = (): ModelChoice => {
  try {
    const stored = localStorage.getItem(MODEL_CHOICE_KEY);
    return MODEL_CHOICES.some((choice) => choice.value === stored) ? (stored as ModelChoice) : 'auto';
  } catch {
    return 'auto';
  }
};

export const writeModelChoice = (value: ModelChoice) => {
  try {
    localStorage.setItem(MODEL_CHOICE_KEY, value);
  } catch {
    // Remembering the choice is a convenience only.
  }
};
