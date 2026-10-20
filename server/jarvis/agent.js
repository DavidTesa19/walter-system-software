// One Jarvis turn: the user's message in, Claude thinking and calling tools in a
// loop, the answer streamed out.
//
// A manual streaming loop (rather than the SDK's tool runner) because the turn
// is relayed live to the browser and persisted as it goes: each assistant
// message is stored together with its tool results, so a turn cut short by the
// user still leaves a valid, append-only history behind.

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from './prompt.js';
import { TOOL_DEFINITIONS, runTool, toolLabel } from './tools.js';

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
const BETAS = ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'];

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

const zeroUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

const addUsage = (total, usage) => {
  if (!usage) return;
  total.input += usage.input_tokens ?? 0;
  total.output += usage.output_tokens ?? 0;
  total.cacheRead += usage.cache_read_input_tokens ?? 0;
  total.cacheWrite += usage.cache_creation_input_tokens ?? 0;
};

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
          // tools + system are the stable, cached prefix; top-level
          // cache_control caches the growing conversation after it.
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          tools: TOOL_DEFINITIONS,
          cache_control: { type: 'ephemeral' },
          messages,
        },
        { signal }
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') emit('text', { delta: event.delta.text });
          else if (event.delta.type === 'thinking_delta' && event.delta.thinking) emit('thinking', { delta: event.delta.thinking });
        } else if (event.type === 'content_block_start' && event.content_block.type === 'text') {
          emit('text_start', {});
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

    if (message.stop_reason === 'refusal') {
      const text = 'Tuto žádost nemohu zpracovat. Zkuste ji prosím formulovat jinak.';
      emit('notice', { text });
      await onStep([], [{ type: 'notice', text }]);
      return { usage, stopReason: 'refusal' };
    }

    const content = contentForHistory(message.content);
    const toolUses = content.filter((block) => block.type === 'tool_use');
    const answer = content.filter((block) => block.type === 'text').map((block) => block.text).join('').trim();

    if (toolUses.length === 0 || message.stop_reason === 'max_tokens') {
      // A final answer (or one cut off by max_tokens — never run the tool
      // calls of a truncated turn).
      const kept = content.filter((block) => block.type !== 'tool_use');
      if (!answer && message.stop_reason === 'end_turn' && !askedForAnswer) {
        // Nothing to read: drop this reply (it is the last message, never sent
        // back) and ask for the answer. The nudge is stored with the history so
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
      await onStep(assistant ? [assistant] : [], answer ? [{ type: 'answer', text: answer, model: message.model }] : []);
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
        ...(answer ? [{ type: 'note', text: answer }] : []),
        ...steps.map((step, index) => ({ type: 'tool', name: step.name, label: step.label, ok: !results[index].isError })),
      ]
    );
  }

  const text = 'Jarvis udělal maximální počet kroků a skončil. Zkuste otázku zúžit.';
  emit('notice', { text });
  await onStep([], [{ type: 'notice', text }]);
  return { usage, stopReason: 'tool_limit' };
}
