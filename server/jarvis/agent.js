// One Jarvis turn: the user's message in, Claude thinking and calling tools in a
// loop, the answer streamed out.
//
// A manual streaming loop (rather than the SDK's tool runner) because the turn
// is relayed live to the browser and persisted as it goes: each assistant
// message is stored together with its tool results, so a turn cut short by the
// user still leaves a valid, append-only history behind.

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './prompt.js';
import { TOOL_DEFINITIONS, WEB_TOOL_NAMES, runTool, toolLabel } from './tools.js';

export const JARVIS_MODEL = process.env.JARVIS_MODEL || 'claude-opus-5-5';
const JARVIS_EFFORT = process.env.JARVIS_EFFORT || 'medium';
const MAX_TOKENS = 64000;
const MAX_TOOL_ROUNDS = 12;
const MAX_JSON_RETRIES = 2;

// On Claude Opus 5.5, text written before a tool call comes back as a
// progress note inside a thinking block, not as answer text. A model that
// writes its answer and then, say, offers an open_record button ends the turn
// with nothing for the user to read. This asks it once for the answer itself.
// A mid-conversation system message: it follows the tool results (a user
// message) and is answered by the assistant, as the API requires.
const ANSWER_NUDGE =
  'Uživatel tvou odpověď neviděl: text napsaný před voláním nástroje se mu zobrazí jen jako průběžná poznámka. ' +
  'Napiš mu teď celou odpověď znovu, bez dalších nástrojů.';

// server-side-fallback: if the model's safety classifiers decline a request
// (a false positive, in a CRM), Anthropic re-runs it on its recommended
// fallback model instead of returning a refusal.
// thinking-binding-controls: with drop_block, an earlier thinking block whose
// prefix no longer matches (a deploy changed the prompt or tools mid-
// conversation) is dropped instead of failing the request.
// context-management + compact: long conversations, below.
const BETAS = [
  'server-side-fallback-2026-07-01',
  'thinking-binding-controls-2026-08-01',
  'context-management-2025-06-27',
  'compact-2026-01-12',
];

const envNumber = (name, fallback) => (Number(process.env[name]) > 0 ? Number(process.env[name]) : fallback);

// Long conversations. The whole history is sent with every question, so a
// long one gets slower and dearer each time. Both measures run on Anthropic's
// side: the stored history stays append-only and replays exactly as it ran,
// and neither invalidates Claude's earlier thinking.
// - Old tool results (search hits, record lists, document text: most of a long
//   conversation) are replaced by a placeholder once the request passes
//   CLEAR_TOOLS_AT tokens, keeping the latest KEEP_TOOL_USES. Clearing rewrites
//   the prompt cache from that point, so it waits until at least
//   CLEAR_AT_LEAST tokens can go. Results of the tools that change things stay:
//   they are small and say what Jarvis proposed, added or drafted.
// - Past COMPACT_AT tokens (the API's minimum is 50 000) the API summarises the
//   conversation so far into a `compaction` block at the start of the reply.
//   It is stored with the reply like any other content; from then on the API
//   ignores everything before it.
const CLEAR_TOOLS_AT = envNumber('JARVIS_CLEAR_TOOLS_AT', 40000);
const KEEP_TOOL_USES = 8;
const CLEAR_AT_LEAST = 10000;
const COMPACT_AT = Math.max(50000, envNumber('JARVIS_COMPACT_AT', 120000));
const KEEP_TOOL_RESULTS = [
  'propose_update',
  'propose_note',
  'calendar_add_event',
  'calendar_update_event',
  'calendar_delete_event',
  'draft_email',
  'create_document',
  'export_records',
];
const CONTEXT_MANAGEMENT = {
  edits: [
    {
      type: 'clear_tool_uses_20250919',
      trigger: { type: 'input_tokens', value: CLEAR_TOOLS_AT },
      keep: { type: 'tool_uses', value: KEEP_TOOL_USES },
      clear_at_least: { type: 'input_tokens', value: CLEAR_AT_LEAST },
      exclude_tools: KEEP_TOOL_RESULTS,
    },
    { type: 'compact_20260112', trigger: { type: 'input_tokens', value: COMPACT_AT } },
  ],
};

const COMPACTION_LABEL = 'Zkracuji dlouhou konverzaci';

let anthropicClient = null;
export const isJarvisConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
const anthropic = () => {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
};

// After a fallback mid-output, the blocks the declined model produced before
// the switch must not be echoed back except plain text (Anthropic's rule for
// replaying fallback turns).
export function contentForHistory(content) {
  const lastFallback = content.map((block) => block.type).lastIndexOf('fallback');
  if (lastFallback === -1) return content;
  return content.filter((block, index) => index > lastFallback || block.type === 'text' || block.type === 'fallback');
}

const zeroUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 });

// A compaction is billed on top of the reply: the top-level counts leave its
// iteration out. Web searches are billed per search on top of their tokens.
const addUsage = (total, usage) => {
  if (!usage) return;
  const compactions = (usage.iterations ?? []).filter((iteration) => iteration.type === 'compaction');
  for (const part of [usage, ...compactions]) {
    total.input += part.input_tokens ?? 0;
    total.output += part.output_tokens ?? 0;
    total.cacheRead += part.cache_read_input_tokens ?? 0;
    total.cacheWrite += part.cache_creation_input_tokens ?? 0;
  }
  total.webSearches += usage.server_tool_use?.web_search_requests ?? 0;
};

// Web searches and page reads run on Anthropic's side, inside the reply; the
// panel shows them as steps like Jarvis's own tools.
const webLabel = (name, input) => {
  if (name === 'web_search') return input?.query ? `Hledám na webu: „${String(input.query).slice(0, 60)}“` : 'Hledám na webu';
  try {
    return `Čtu stránku ${new URL(input?.url).hostname}`;
  } catch {
    return 'Čtu stránku';
  }
};
const isWebResult = (block) => block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result';
const webResultOk = (block) => !String(block.content?.type ?? '').endsWith('error');

// The web steps of one reply, for the stored transcript.
function webSteps(content) {
  const results = new Map(content.filter(isWebResult).map((block) => [block.tool_use_id, block]));
  return content
    .filter((block) => block.type === 'server_tool_use' && WEB_TOOL_NAMES.includes(block.name))
    .map((block) => ({
      type: 'tool',
      name: block.name,
      label: webLabel(block.name, block.input),
      ok: results.has(block.id) ? webResultOk(results.get(block.id)) : true,
    }));
}

// Pages the answer cites, once each, for a "Zdroje" list under it.
function citedSources(content) {
  const sources = new Map();
  for (const block of content) {
    if (block.type !== 'text') continue;
    for (const citation of block.citations ?? []) {
      if (citation.url && !sources.has(citation.url)) sources.set(citation.url, { url: citation.url, title: citation.title || citation.url });
    }
  }
  return [...sources.values()].slice(0, 12);
}

// What context management did to this request, for the server log.
function logContextEdits(message) {
  const applied = message.context_management?.applied_edits ?? [];
  const parts = applied.map((edit) =>
    edit.type === 'clear_tool_uses_20250919'
      ? `cleared ${edit.cleared_tool_uses} tool results (${edit.cleared_input_tokens} tokens)`
      : `${edit.type} (${edit.cleared_input_tokens ?? '?'} tokens)`
  );
  if (message.content.some((block) => block.type === 'compaction')) parts.push('compacted the conversation');
  if (parts.length) console.log(`Jarvis context: ${parts.join(', ')}`);
}

function friendlyError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'Jarvis nemá platný klíč k Claude API (ANTHROPIC_API_KEY).';
  // Attachments live 90 days; an older conversation that had one cannot go on.
  if ((error instanceof Anthropic.NotFoundError || error instanceof Anthropic.BadRequestError) && /file/i.test(error.message ?? '')) {
    return 'Některá příloha v této konverzaci už vypršela nebo byla smazána. Začněte prosím novou konverzaci.';
  }
  if (error instanceof Anthropic.RateLimitError) return 'Jarvis je teď vytížený. Zkuste to prosím za chvíli.';
  if (error instanceof Anthropic.APIConnectionError) return 'Nepodařilo se spojit s Claude API. Zkuste to znovu.';
  if (error instanceof Anthropic.APIError && error.status >= 500) return 'Služba Claude má výpadek. Zkuste to prosím za chvíli.';
  return 'Jarvis narazil na chybu a odpověď nedokončil.';
}

/**
 * history     the conversation's API messages, ending with the new user message
 *             (already persisted by the caller)
 * toolContext what tools need: api client, user, allowed sections, emitAction
 * emit        (event, data) => void — relays progress to the browser
 * onStep      (messages, transcript) => Promise — persists a completed step
 */
export async function runJarvisTurn({ history, toolContext, emit, onStep, signal }) {
  const usage = zeroUsage();
  let messages = [...history];
  let jsonRetries = 0;
  let askedForAnswer = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (signal.aborted) return { usage, stopReason: 'aborted' };

    let message;
    try {
      const stream = anthropic().beta.messages.stream(
        {
          model: JARVIS_MODEL,
          max_tokens: MAX_TOKENS,
          betas: BETAS,
          fallbacks: 'default',
          thinking: {
            type: 'adaptive',
            display: 'summarized',
            block_binding: { prefix_mismatch_behavior: 'drop_block' },
          },
          output_config: { effort: JARVIS_EFFORT },
          context_management: CONTEXT_MANAGEMENT,
          // tools + system are the stable, cached prefix; top-level
          // cache_control caches the growing conversation after it.
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          tools: TOOL_DEFINITIONS,
          cache_control: { type: 'ephemeral' },
          messages,
        },
        { signal }
      );

      // A compaction is written before anything else and can take a while:
      // the panel shows it as a step.
      const compactionStep = { id: `compaction-${round}`, label: COMPACTION_LABEL };
      // A web search's query arrives in pieces (or whole, when Claude's own
      // filtering code calls it); its step is shown once the query is known.
      const webCalls = new Map();
      const showWebCall = (call) => emit('tool', { id: call.id, name: call.name, label: webLabel(call.name, call.input) });
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') emit('text', { delta: event.delta.text });
          else if (event.delta.type === 'thinking_delta' && event.delta.thinking) emit('thinking', { delta: event.delta.thinking });
          else if (event.delta.type === 'compaction_delta') emit('tool_done', { id: compactionStep.id, ok: true });
          else if (event.delta.type === 'input_json_delta' && webCalls.has(event.index)) webCalls.get(event.index).json += event.delta.partial_json;
        } else if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'text') emit('text_start', {});
          else if (block.type === 'compaction') emit('tool', { ...compactionStep, name: 'compaction' });
          else if (block.type === 'server_tool_use' && WEB_TOOL_NAMES.includes(block.name)) {
            const call = { id: block.id, name: block.name, input: block.input, json: '' };
            if (call.input && Object.keys(call.input).length) showWebCall(call);
            else webCalls.set(event.index, call);
          } else if (isWebResult(block)) emit('tool_done', { id: block.tool_use_id, ok: webResultOk(block) });
        } else if (event.type === 'content_block_stop' && webCalls.has(event.index)) {
          const call = webCalls.get(event.index);
          webCalls.delete(event.index);
          try {
            call.input = JSON.parse(call.json || '{}');
          } catch {
            call.input = {};
          }
          showWebCall(call);
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (error) {
      if (signal.aborted || error instanceof Anthropic.APIUserAbortError) return { usage, stopReason: 'aborted' };
      // An unparseable streamed tool input (no tool_use block to answer):
      // re-issue the same request, a couple of times at most.
      if (!(error instanceof Anthropic.APIError) && error instanceof Anthropic.AnthropicError && jsonRetries < MAX_JSON_RETRIES) {
        jsonRetries += 1;
        emit('text_reset', {});
        continue;
      }
      console.error('Jarvis model call failed:', error);
      emit('error', { message: friendlyError(error) });
      return { usage, stopReason: 'error' };
    }

    addUsage(usage, message.usage);
    logContextEdits(message);
    const compacted = message.content.some((block) => block.type === 'compaction')
      ? [{ type: 'tool', name: 'compaction', label: 'Dlouhá konverzace zkrácena', ok: true }]
      : [];

    if (message.stop_reason === 'refusal') {
      const text = 'Tuto žádost nemohu zpracovat. Zkuste ji prosím formulovat jinak.';
      emit('notice', { text });
      await onStep([], [{ type: 'notice', text }]);
      return { usage, stopReason: 'refusal' };
    }

    const content = contentForHistory(message.content);
    const toolUses = content.filter((block) => block.type === 'tool_use');
    const answer = content.filter((block) => block.type === 'text').map((block) => block.text).join('').trim();
    const web = webSteps(content);

    // A long web search paused on Anthropic's side: send the reply back as
    // it is and the server carries on (no extra user message, by the API's
    // rules).
    if (message.stop_reason === 'pause_turn') {
      const assistant = { role: 'assistant', content };
      messages = [...messages, assistant];
      await onStep([assistant], [...compacted, ...(answer ? [{ type: 'note', text: answer }] : []), ...web]);
      continue;
    }

    if (toolUses.length === 0 || message.stop_reason === 'max_tokens') {
      // A final answer (or one cut off by max_tokens — never run the tool
      // calls of a truncated turn).
      const kept = content.filter((block) => block.type !== 'tool_use');
      if (!answer && message.stop_reason === 'end_turn' && !askedForAnswer) {
        // Nothing to read: drop this reply (it is the last message, never sent
        // back; a compaction in it is simply redone) and ask for the answer. The nudge is stored with the history so
        // the conversation replays exactly as it ran.
        askedForAnswer = true;
        const nudge = { role: 'system', content: ANSWER_NUDGE };
        messages = [...messages, nudge];
        await onStep([nudge], []);
        continue;
      }
      // Never store an empty assistant message: the API rejects a history
      // containing one, which would break every later question.
      const assistant = kept.length ? { role: 'assistant', content: kept } : null;
      if (assistant) messages = [...messages, assistant];
      const sources = citedSources(content);
      if (sources.length) emit('sources', { sources });
      await onStep(assistant ? [assistant] : [], [
        ...compacted,
        ...web,
        ...(answer ? [{ type: 'answer', text: answer, model: message.model }] : []),
        ...(sources.length ? [{ type: 'sources', sources }] : []),
      ]);
      if (message.stop_reason === 'max_tokens') emit('notice', { text: 'Odpověď byla příliš dlouhá a je zkrácená.' });
      return { usage, stopReason: message.stop_reason };
    }

    // Run every tool call of this message (in parallel), then store the
    // assistant message and all its results together.
    const steps = toolUses.map((block) => ({ id: block.id, name: block.name, label: toolLabel(block.name, block.input) }));
    for (const step of steps) emit('tool', step);
    const results = await Promise.all(toolUses.map((block) => runTool(block.name, block.input, toolContext)));
    for (const [index, result] of results.entries()) {
      emit('tool_done', { id: steps[index].id, ok: !result.isError });
    }

    const assistant = { role: 'assistant', content };
    const toolResults = {
      role: 'user',
      content: toolUses.map((block, index) => ({
        type: 'tool_result',
        tool_use_id: block.id,
        content: results[index].content,
        ...(results[index].isError ? { is_error: true } : {}),
      })),
    };
    messages = [...messages, assistant, toolResults];
    await onStep(
      [assistant, toolResults],
      [
        ...compacted,
        ...(answer ? [{ type: 'note', text: answer }] : []),
        ...web,
        ...steps.map((step, index) => ({ type: 'tool', name: step.name, label: step.label, ok: !results[index].isError })),
      ]
    );
  }

  const text = 'Jarvis udělal maximální počet kroků a skončil. Zkuste otázku zúžit.';
  emit('notice', { text });
  await onStep([], [{ type: 'notice', text }]);
  return { usage, stopReason: 'tool_limit' };
}
