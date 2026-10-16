// Jarvis HTTP API. Every signed-in user can use Jarvis; what it can see is
// decided per request by the user's own access (see api.js).

import crypto from 'node:crypto';
import { createApiClient } from './api.js';
import { JARVIS_MODEL, isJarvisConfigured, runJarvisTurn } from './agent.js';
import {
  KINDS,
  ROLES,
  ROLE_LABELS,
  SECTIONS,
  SECTION_LABELS,
  recordRef,
  sectionsForScope,
  truncate,
} from './catalog.js';
import { createFileConversationStore, createPgConversationStore } from './store.js';

const MAX_MESSAGE_LENGTH = 8000;
const HOURLY_LIMIT = Number(process.env.JARVIS_HOURLY_LIMIT) > 0 ? Number(process.env.JARVIS_HOURLY_LIMIT) : 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const zeroUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

// Text from the browser that goes into the <kontext> block: kept short and
// unable to close the block early.
const cleanContextText = (value, max = 160) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);

// What the app tells Jarvis at the start of every user message. It changes
// every turn, so it lives here rather than in the cached system prompt.
export function buildContextBlock(user, context) {
  const now = new Date().toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const sections = sectionsForScope(user.accessScope ?? user.access_scope).map((id) => SECTION_LABELS[id]).join(', ');
  const lines = [
    `Datum a čas: ${now} (Praha)`,
    `Uživatel: ${cleanContextText(user.username, 60)} (id ${user.id}, role ${cleanContextText(user.role, 20)}; přístup: ${sections})`,
  ];
  if (context?.view) lines.push(`Obrazovka: ${cleanContextText(context.view)}`);
  const record = context?.record;
  if (
    record
    && SECTIONS.includes(record.section)
    && ROLES.includes(record.role)
    && KINDS.includes(record.kind)
    && Number.isInteger(Number(record.id))
  ) {
    const ref = recordRef({ section: record.section, role: record.role, kind: record.kind, id: Number(record.id) });
    const what = record.kind === 'subject' ? 'subjekt' : 'zakázka';
    lines.push(
      `Otevřený záznam: ${what} · ${ROLE_LABELS[record.role]} · ${SECTION_LABELS[record.section]} · ${cleanContextText(record.label, 120)} (ref ${ref})`
    );
  }
  return `<kontext>\n${lines.join('\n')}\n</kontext>`;
}

export function registerJarvisRoutes(app, { authenticateToken, pool, dataDir, port, signAgentToken }) {
  const store = pool ? createPgConversationStore(pool) : createFileConversationStore(dataDir);
  const baseUrl = `http://127.0.0.1:${port}`;
  const running = new Set();
  const recentTurns = new Map();

  const withinHourlyLimit = (userId) => {
    const cutoff = Date.now() - 3600 * 1000;
    const turns = (recentTurns.get(userId) ?? []).filter((at) => at > cutoff);
    if (turns.length >= HOURLY_LIMIT) {
      recentTurns.set(userId, turns);
      return false;
    }
    turns.push(Date.now());
    recentTurns.set(userId, turns);
    return true;
  };

  app.get('/api/jarvis/status', authenticateToken, (_req, res) => {
    res.json({ available: isJarvisConfigured(), model: JARVIS_MODEL });
  });

  app.get('/api/jarvis/conversations', authenticateToken, async (req, res) => {
    try {
      res.json(await store.list(Number(req.user.id)));
    } catch (error) {
      console.error('Jarvis: listing conversations failed:', error);
      res.status(500).json({ error: 'Nepodařilo se načíst konverzace.' });
    }
  });

  app.get('/api/jarvis/conversations/:id', authenticateToken, async (req, res) => {
    try {
      if (!UUID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Konverzace nenalezena.' });
      const conversation = await store.get(req.params.id, Number(req.user.id));
      if (!conversation) return res.status(404).json({ error: 'Konverzace nenalezena.' });
      res.json({ id: conversation.id, title: conversation.title, transcript: conversation.transcript ?? [] });
    } catch (error) {
      console.error('Jarvis: loading a conversation failed:', error);
      res.status(500).json({ error: 'Nepodařilo se načíst konverzaci.' });
    }
  });

  app.delete('/api/jarvis/conversations/:id', authenticateToken, async (req, res) => {
    try {
      if (!UUID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Konverzace nenalezena.' });
      if (running.has(req.params.id)) return res.status(409).json({ error: 'Jarvis v této konverzaci právě pracuje.' });
      const removed = await store.remove(req.params.id, Number(req.user.id));
      res.status(removed ? 204 : 404).end();
    } catch (error) {
      console.error('Jarvis: deleting a conversation failed:', error);
      res.status(500).json({ error: 'Nepodařilo se smazat konverzaci.' });
    }
  });

  // One user message in, the answer streamed back as Server-Sent Events:
  // conversation, text_start/text, thinking, tool/tool_done, action, notice,
  // error, done.
  app.post('/api/jarvis/chat', authenticateToken, async (req, res) => {
    if (!isJarvisConfigured()) return res.status(503).json({ error: 'Jarvis není nastavený (chybí ANTHROPIC_API_KEY).' });
    const user = req.user;
    const userId = Number(user.id);
    const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!text) return res.status(400).json({ error: 'Napište zprávu.' });
    if (text.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'Zpráva je příliš dlouhá.' });

    let conversation = null;
    const requestedId = req.body?.conversationId;
    try {
      if (requestedId) {
        if (!UUID_PATTERN.test(requestedId)) return res.status(404).json({ error: 'Konverzace nenalezena.' });
        conversation = await store.get(requestedId, userId);
        if (!conversation) return res.status(404).json({ error: 'Konverzace nenalezena.' });
      }
    } catch (error) {
      console.error('Jarvis: loading a conversation failed:', error);
      return res.status(500).json({ error: 'Nepodařilo se načíst konverzaci.' });
    }
    if (conversation && running.has(conversation.id)) {
      return res.status(409).json({ error: 'Jarvis v této konverzaci ještě odpovídá.' });
    }
    if (!withinHourlyLimit(userId)) {
      return res.status(429).json({ error: `Limit ${HOURLY_LIMIT} zpráv za hodinu je vyčerpaný. Zkuste to později.` });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const emit = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    let conversationId = conversation?.id ?? null;
    try {
      if (!conversation) {
        conversationId = crypto.randomUUID();
        await store.create({ id: conversationId, userId, title: truncate(text.replace(/\s+/g, ' '), 70), model: JARVIS_MODEL });
      }
      running.add(conversationId);
      emit('conversation', { id: conversationId, isNew: !conversation });

      const userMessage = {
        role: 'user',
        content: [
          { type: 'text', text: buildContextBlock(user, req.body?.context) },
          { type: 'text', text },
        ],
      };
      await store.append(conversationId, userId, {
        messages: [userMessage],
        transcript: [{ type: 'question', text, at: new Date().toISOString() }],
        usage: zeroUsage(),
      });

      const pendingActions = [];
      const api = createApiClient({
        baseUrl,
        token: signAgentToken(user),
        changesetId: `jarvis-${conversationId.slice(0, 8)}-${Date.now().toString(36)}`,
        note: `Jarvis: ${truncate(text, 200)}`,
      });
      const toolContext = {
        api,
        user,
        sections: sectionsForScope(user.accessScope ?? user.access_scope),
        emitAction: (action) => {
          pendingActions.push({ type: 'action', action });
          emit('action', action);
        },
      };

      const result = await runJarvisTurn({
        history: [...(conversation?.messages ?? []), userMessage],
        toolContext,
        emit,
        signal: abort.signal,
        onStep: (messages, transcript) =>
          store.append(conversationId, userId, {
            messages,
            transcript: [...transcript, ...pendingActions.splice(0)],
            usage: zeroUsage(),
          }),
      });

      await store.append(conversationId, userId, {
        messages: [],
        transcript: pendingActions.splice(0),
        usage: result.usage,
      });
      console.log(
        `Jarvis turn: user ${userId}, ${result.stopReason}, tokens in ${result.usage.input} / out ${result.usage.output}` +
        ` / cache read ${result.usage.cacheRead} / cache write ${result.usage.cacheWrite}`
      );
      emit('done', { stopReason: result.stopReason });
    } catch (error) {
      console.error('Jarvis turn failed:', error);
      emit('error', { message: 'Jarvis narazil na chybu a odpověď nedokončil.' });
    } finally {
      if (conversationId) running.delete(conversationId);
      if (!res.writableEnded) res.end();
    }
  });

  return { store };
}
