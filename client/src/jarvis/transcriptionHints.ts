import type { AttentionItem, JarvisOpenAction } from './jarvisApi';
import type { JarvisFocus } from './jarvisFocus';
import { toSpeechText } from './voice';

// What a spoken question will probably name, sent with the recording so the
// transcriber spells it right: uncommon Czech surnames and company names are
// what it gets wrong. `keywords` are exact spellings (the open record, names
// and codes from Jarvis's last answers, the records needing attention);
// `context` is the last answer, which a follow-up question usually refers to.
// The server drops what it cannot use (server/jarvis/voice.js).
export interface TranscriptionHints {
  keywords: string[];
  context: string;
}

export interface HintSource {
  focus: JarvisFocus | null;
  // Jarvis's answers, oldest first.
  answers: string[];
  // Records offered with open_record, oldest first.
  actions: JarvisOpenAction[];
  attention: AttentionItem[];
}

const MAX_KEYWORDS = 40;
const CONTEXT_CHARS = 600;

const CODE = /\b[A-Z]{1,3}\d{2,4}(?:-\d{2,4})?\b/g;
const CAPITAL = /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/u;
// Not at a colon: "klienty: Novák, Dvořák" goes on with a name.
const SENTENCE = /(?<=[.!?…])\s+/u;
const isTableRule = (line: string) => /^[\s|:-]+$/.test(line) && line.includes('-');

// The cells of a Markdown table's body rows that start with a capital: names
// of firms, people and zakázky, whole ("Rekonstrukce haly", not "Rekonstrukce").
function tableNames(markdown: string): string[] {
  const lines = markdown.split('\n').map((line) => line.trim());
  return lines.flatMap((line, index) => {
    if (!line.startsWith('|') || isTableRule(line) || isTableRule(lines[index + 1] ?? '')) return [];
    return line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.replace(/(\*\*|__|`)/g, '').trim())
      .filter((cell) => cell.length > 1 && cell.length <= 60 && CAPITAL.test(cell));
  });
}

// "K012 · Novák Stavby" → the code and the name.
const labelParts = (label: string) =>
  label
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean);

// Czech capitalises names, not ordinary words, so a run of capitalised words
// that does not open a sentence is almost always one ("Lesprojekt Vysočina").
// A name opening a sentence is missed; the codes and the records offered
// alongside usually cover it.
export function namesInText(text: string): string[] {
  const names: string[] = [];
  for (const sentence of text.split(SENTENCE)) {
    let run: string[] = [];
    const flush = () => {
      if (run.length) names.push(run.join(' '));
      run = [];
    };
    sentence.split(/\s+/).forEach((raw, index) => {
      const word = raw.replace(/^[„"“(]+|[,.!?:;…”"“)]+$/gu, '');
      if (index > 0 && word.length > 1 && CAPITAL.test(word)) run.push(word);
      else flush();
      // "Novák, Dvořák a Svoboda" are three names, not one.
      if (word !== raw && /[,;:)”"“]$/u.test(raw)) flush();
    });
    flush();
  }
  return names;
}

export function buildTranscriptionHints({ focus, answers, actions, attention }: HintSource): TranscriptionHints {
  const keywords: string[] = [];
  const add = (value: string) => {
    if (keywords.length < MAX_KEYWORDS && !keywords.includes(value)) keywords.push(value);
  };
  if (focus) {
    labelParts(focus.subject.label).forEach(add);
    if (focus.commission) labelParts(focus.commission.label).forEach(add);
  }
  // The latest answers first: the next question is most likely about them.
  const recent = answers.slice(-2).reverse();
  for (const markdown of recent) {
    const text = toSpeechText(markdown);
    for (const code of text.match(CODE) ?? []) add(code);
    tableNames(markdown).forEach(add);
    namesInText(text).forEach(add);
  }
  for (const action of actions.slice(-5).reverse()) labelParts(action.label).forEach(add);
  for (const item of attention) if (item.action) labelParts(item.label).forEach(add);
  return { keywords, context: recent[0] ? toSpeechText(recent[0]).slice(0, CONTEXT_CHARS) : '' };
}
