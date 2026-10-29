// Which Claude model answers a question. Opus 5.5 is the strongest and the
// dearest (about twice Sonnet 5.5 and forty times Haiku 5.5 per token); most
// questions do not need it. The panel lets the user pick a model, and when it
// is left on "Automaticky" each question is matched to one here.
//
// Nothing here calls the API: the choice is a few patterns over the text, so it
// costs nothing and can be explained in the answer ("Haiku · krátký dotaz").

const CHOICES = {
  opus: { id: process.env.JARVIS_MODEL || 'claude-opus-5-5', label: 'Opus 5.5' },
  sonnet: { id: process.env.JARVIS_MODEL_SONNET || 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  haiku: { id: process.env.JARVIS_MODEL_HAIKU || 'claude-haiku-5-5', label: 'Haiku 5.5' },
};

export const MODEL_KEYS = Object.keys(CHOICES);
export const MODEL_CHOICE_AUTO = 'auto';
export const labelFor = (modelId) => Object.values(CHOICES).find((choice) => choice.id === modelId)?.label ?? modelId;

// Features that differ between the models, so one request shape cannot serve all:
// - Haiku 5.5 has no server-side fallback (the `fallbacks` option is refused
//   there) and gets the basic web tools, not the dynamic-filtering ones.
// - Context management (clearing old tool results, compaction) is sent to Opus
//   and Sonnet only; Haiku's requests stay plain, its conversations are short
//   enough that the 1M window is never the limit in practice.
export function profileFor(modelId) {
  const haiku = /haiku/.test(modelId);
  return {
    fallbacks: !haiku,
    webVersion: haiku ? 'basic' : 'current',
    contextManagement: !haiku,
  };
}

// Questions that need the strongest model: long analysis, drafting, documents,
// or anything attached. Checked first.
const HARD = /analyz|porovn|navrh|strategi|proč|doporuč|vysvětl|shrň|rizik|posuď|zhodnoť|vypočít|sestav|napiš|vytvoř|dokument|pdf|excel|word|smlouv|nabídk|přehled|plán/i;
// Questions that change data or search the web: the middle model, so the
// answer is careful with what it proposes or finds.
const CHANGE_OR_WEB = /změň|přepni|přidej|nastav|smaž|odstraň|připomeň|naplánuj|zapiš|přiřaď|poznámk|na webu|vyhledej|internet/i;
// Short look-ups of one fact: the cheapest model is enough. Not lists, deadlines
// or "what do I have to do" (Haiku answered those with a bare pointer to a button
// in the eval set), and not requests to open a record. A bare "jaké/jaký" is not
// a fact word: "Jaké zakázky mám?" is a list.
const SIMPLE = /kolik|kdo je|kdo má|telefon|číslo|e-mail|email|ičo|adres|kdy|zítra|kde je|najdi|hledej/i;
const NOT_SIMPLE = /seznam|vypiš|všechn|které|kteří|termín|dnes|dneska|otevř|zakázky/i;

/**
 * The model for a question, when the user has not chosen one.
 * Returns { key, reason } where reason is a short Czech phrase for the panel.
 */
export function chooseModel({ question, hasAttachments = false }) {
  const text = question.trim();
  if (hasAttachments) return { key: 'opus', reason: 'příloha' };
  if (text.length > 400) return { key: 'opus', reason: 'dlouhý dotaz' };
  if (HARD.test(text)) return { key: 'opus', reason: 'náročnější úkol' };
  if (CHANGE_OR_WEB.test(text)) return { key: 'sonnet', reason: 'změna nebo hledání na webu' };
  if (text.length <= 160 && SIMPLE.test(text) && !NOT_SIMPLE.test(text)) return { key: 'haiku', reason: 'krátký dotaz' };
  return { key: 'sonnet', reason: 'běžný dotaz' };
}

// The history is always sent unchanged, whichever model answers: the API drops
// thinking blocks the current model cannot read (unbilled) and keeps them for a
// later turn on a model that can, while stripping them here would be an edit of
// the history (see CLAUDE.md). Two kinds of block are written by features Haiku
// is not given here: the compaction summary (context management) and the
// code-execution steps of the dynamic web tools. A conversation holding either
// goes to Sonnet instead of Haiku, so a request is never built that Haiku may
// refuse.
const isFullModelBlock = (block) =>
  block?.type === 'compaction'
  || /code_execution/.test(block?.type ?? '')
  || (block?.type === 'server_tool_use' && /code_execution/.test(block?.name ?? ''));
const needsFullModel = (messages) =>
  messages.some((message) => Array.isArray(message.content) && message.content.some(isFullModelBlock));

/**
 * What one question will be answered with.
 * `requested` is what the panel sent: 'auto', or a key from MODEL_KEYS.
 * `history` is the conversation's stored messages so far.
 */
export function resolveModel({ requested, question, hasAttachments, history = [] }) {
  let key;
  let routing;
  if (MODEL_KEYS.includes(requested)) {
    key = requested;
    routing = { mode: 'manual', key };
  } else {
    const choice = chooseModel({ question, hasAttachments });
    key = choice.key;
    routing = { mode: 'auto', key, reason: choice.reason };
  }
  if (!profileFor(CHOICES[key].id).contextManagement && needsFullModel(history)) {
    key = 'sonnet';
    routing = { ...routing, key, reason: 'tuto konverzaci Haiku nepřečte (web nebo zkrácení)' };
  }
  return { model: CHOICES[key].id, routing };
}

