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
// in the eval set), and not requests to open a record.
const SIMPLE = /kolik|kdo je|kdo má|jaký|jaké|jaká|telefon|e-mail|email|ičo|kdy|zítra|kde je|najdi|hledej/i;

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
  if (text.length <= 160 && SIMPLE.test(text)) return { key: 'haiku', reason: 'krátký dotaz' };
  return { key: 'sonnet', reason: 'běžný dotaz' };
}

/**
 * What one question will be answered with.
 * `requested` is what the panel sent: 'auto', or a key from MODEL_KEYS.
 */
export function resolveModel({ requested, question, hasAttachments }) {
  if (MODEL_KEYS.includes(requested)) {
    return { model: CHOICES[requested].id, routing: { mode: 'manual', key: requested } };
  }
  const { key, reason } = chooseModel({ question, hasAttachments });
  return { model: CHOICES[key].id, routing: { mode: 'auto', key, reason } };
}

// Thinking blocks are signed by the model that wrote them, and the code-execution
// blocks of the dynamic web tools only mean something to a model that has that
// tool. Before a conversation continues on another model, those are removed
// from the history sent (the stored history is not edited).
const SWITCH_DROPPED_BLOCK = /^(thinking|redacted_thinking)$|code_execution/;
export function historyForModel(messages, modelId, previousModelId) {
  if (!previousModelId || previousModelId === modelId) return messages;
  return messages
    .map((message) => {
      if (message.role !== 'assistant' || !Array.isArray(message.content)) return message;
      const content = message.content.filter(
        (block) => !SWITCH_DROPPED_BLOCK.test(block.type ?? '') && !(block.type === 'server_tool_use' && /code_execution/.test(block.name ?? ''))
      );
      return { ...message, content };
    })
    .filter((message) => message.role !== 'assistant' || !Array.isArray(message.content) || message.content.length > 0);
}
