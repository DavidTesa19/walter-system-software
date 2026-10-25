// Jarvis HTTP API. Every signed-in user can use Jarvis; what it can see is
// decided per request by the user's own access (see api.js).

import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
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
import { MAX_AUDIO_BYTES, MAX_SPEECH_CHARS, TTS_SPEED, TTS_SPEEDS, TTS_VOICE, TTS_VOICES, isVoiceConfigured, synthesize, transcribe } from './voice.js';
import {
  AttachmentError,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  attachmentBlock,
  conversationFileIds,
  createPendingAttachments,
  deleteFiles,
  prepareAttachment,
} from './attachments.js';
import { recordAiUsage } from '../finance/usage.js';
import { ProposalError, applyProposal, describeProposal } from './proposals.js';
import { CalendarError, calendarOutcomes, cardState, decideCalendarCard } from './calendarActions.js';

const MAX_MESSAGE_LENGTH = 8000;
const HOURLY_LIMIT = Number(process.env.JARVIS_HOURLY_LIMIT) > 0 ? Number(process.env.JARVIS_HOURLY_LIMIT) : 60;
// Transcriptions plus read-aloud requests; a long answer is read in a few pieces.
const VOICE_HOURLY_LIMIT = Number(process.env.JARVIS_VOICE_HOURLY_LIMIT) > 0 ? Number(process.env.JARVIS_VOICE_HOURLY_LIMIT) : 300;
const ATTACHMENT_HOURLY_LIMIT = Number(process.env.JARVIS_ATTACHMENT_HOURLY_LIMIT) > 0 ? Number(process.env.JARVIS_ATTACHMENT_HOURLY_LIMIT) : 100;

// Busboy hands multer the filename as latin1; browsers send UTF-8, so "Smlouva
// č. 2.pdf" arrives garbled unless it is re-decoded.
const uploadedFilename = (raw) => {
  const name = String(raw ?? '').replace(/[\r\n]/g, '').trim() || 'soubor';
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return (decoded.includes('\uFFFD') ? name : decoded).slice(-180);
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const zeroUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

const PROPOSAL_STATUS_TEXT = {
  applied: 'uživatel potvrdil, provedeno',
  rejected: 'uživatel zamítl, neprovedeno',
  stale: 'neprovedeno – záznam se mezitím změnil',
  failed: 'provedení selhalo',
};

// What became of Jarvis's proposed changes since the user's last message,
// and which still wait for a decision — so its next answer knows.
export function proposalOutcomes(transcript = []) {
  const lastQuestion = transcript.map((item) => item.type).lastIndexOf('question');
  const proposals = new Map(transcript.filter((item) => item.type === 'proposal' && item.proposal).map((item) => [item.proposal.id, item.proposal]));
  const decided = new Set();
  const lines = [];
  transcript.forEach((item, index) => {
    if (item.type !== 'proposal_status') return;
    decided.add(item.id);
    const proposal = proposals.get(item.id);
    if (index > lastQuestion && proposal) {
      lines.push(`Návrh ${describeProposal(proposal)}: ${PROPOSAL_STATUS_TEXT[item.status] ?? item.status}${item.error ? ` (${item.error})` : ''}`);
    }
  });
  const pending = [...proposals.values()].filter((proposal) => !decided.has(proposal.id));
  for (const proposal of pending.slice(-10)) lines.push(`Návrh ${describeProposal(proposal)}: stále čeká na potvrzení`);
  return lines;
}

const isReplayable = (message) => !(message.role === 'assistant' && Array.isArray(message.content) && message.content.length === 0);

// Text from the browser that goes into the <kontext> block: kept short and
// unable to close the block early.
const cleanContextText = (value, max = 160) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);

// What the app tells Jarvis at the start of every user message. It changes
// every turn, so it lives here rather than in the cached system prompt.
export function buildContextBlock(user, context, attachmentNames = [], proposalLines = []) {
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
  if (context?.voice === true) lines.push('Režim: hlasový (uživatel otázku řekl nahlas a odpověď mu bude přečtena)');
  if (attachmentNames.length) lines.push(`Přílohy této zprávy: ${attachmentNames.map((name) => cleanContextText(name, 120)).join(', ')}`);
  for (const line of proposalLines) lines.push(cleanContextText(line, 400));
  // The profile open in a grid, and the zakázka selected in it.
  const describeOpen = (record, title) => {
    if (
      !record
      || !SECTIONS.includes(record.section)
      || !ROLES.includes(record.role)
      || !KINDS.includes(record.kind)
      || !Number.isInteger(Number(record.id))
      || Number(record.id) <= 0
    ) return;
    const ref = recordRef({ section: record.section, role: record.role, kind: record.kind, id: Number(record.id) });
    const what = record.kind === 'subject' ? 'subjekt' : 'zakázka';
    lines.push(
      `${title}: ${what} · ${ROLE_LABELS[record.role]} · ${SECTION_LABELS[record.section]} · ${cleanContextText(record.label, 120)} (ref ${ref})`
    );
  };
  describeOpen(context?.record, 'Otevřený záznam');
  describeOpen(context?.commission, 'Vybraná zakázka v jeho profilu');
  return `<kontext>\n${lines.join('\n')}\n</kontext>`;
}

export function registerJarvisRoutes(app, { authenticateToken, pool, dataDir, port, signAgentToken }) {
  const store = pool ? createPgConversationStore(pool) : createFileConversationStore(dataDir);
  const baseUrl = `http://127.0.0.1:${port}`;
  const running = new Set();

  const createHourlyLimiter = (limit) => {
    const recent = new Map();
    return (userId) => {
      const cutoff = Date.now() - 3600 * 1000;
      const times = (recent.get(userId) ?? []).filter((at) => at > cutoff);
      if (times.length >= limit) {
        recent.set(userId, times);
        return false;
      }
      times.push(Date.now());
      recent.set(userId, times);
      return true;
    };
  };
  const withinHourlyLimit = createHourlyLimiter(HOURLY_LIMIT);
  const withinVoiceLimit = createHourlyLimiter(VOICE_HOURLY_LIMIT);
  const withinAttachmentLimit = createHourlyLimiter(ATTACHMENT_HOURLY_LIMIT);
  const pendingAttachments = createPendingAttachments();

  const attachmentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS } });
  const readAttachments = (req, res, next) =>
    attachmentUpload.array('files', MAX_ATTACHMENTS)(req, res, (error) => {
      if (!error) return next();
      if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Soubor je větší než 25 MB.' });
      if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: `Najednou lze přiložit nejvýš ${MAX_ATTACHMENTS} souborů.` });
      }
      return res.status(400).json({ error: 'Soubory se nepodařilo nahrát.' });
    });

  // Files attached to a message, uploaded while the user types. Each comes back
  // with an id (or the reason it cannot be used); the message then names the
  // ids. No database writes here, so multer's lost request context is harmless.
  app.post('/api/jarvis/attachments', authenticateToken, readAttachments, async (req, res) => {
    if (!isJarvisConfigured()) return res.status(503).json({ error: 'Jarvis není nastavený (chybí ANTHROPIC_API_KEY).' });
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) return res.status(400).json({ error: 'Žádný soubor.' });
    const userId = Number(req.user.id);
    const attachments = [];
    for (const file of files) {
      const name = uploadedFilename(file.originalname);
      if (!withinAttachmentLimit(userId)) {
        attachments.push({ name, error: 'Hodinový limit příloh je vyčerpaný.' });
        continue;
      }
      try {
        const prepared = await prepareAttachment(file.buffer, { name, mimeType: file.mimetype });
        attachments.push({ id: pendingAttachments.add(userId, prepared), name, kind: prepared.kind, size: prepared.size });
      } catch (error) {
        if (!(error instanceof AttachmentError)) console.error('Jarvis: preparing an attachment failed:', error?.message ?? error);
        attachments.push({ name, error: error instanceof AttachmentError ? error.message : 'Soubor se nepodařilo nahrát.' });
      }
    }
    res.json({ attachments });
  });

  // An attachment removed before its message was sent.
  app.delete('/api/jarvis/attachments/:id', authenticateToken, async (req, res) => {
    const removed = await pendingAttachments.remove(Number(req.user.id), String(req.params.id));
    res.status(removed ? 204 : 404).end();
  });

  // `voice` says whether the server can listen and speak; without it the
  // browser uses its own (lower quality) speech engines. `voices` are the
  // ones a user can pick, with the default voice and speed.
  app.get('/api/jarvis/status', authenticateToken, (_req, res) => {
    const voice = isVoiceConfigured();
    res.json({
      available: isJarvisConfigured(),
      model: JARVIS_MODEL,
      voice,
      ...(voice ? { voices: TTS_VOICES, defaultVoice: TTS_VOICE, speeds: TTS_SPEEDS, defaultSpeed: TTS_SPEED } : {}),
    });
  });

  const rawAudio = express.raw({ type: ['audio/*', 'application/octet-stream'], limit: MAX_AUDIO_BYTES });
  const readAudio = (req, res, next) =>
    rawAudio(req, res, (error) => {
      if (!error) return next();
      if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Nahrávka je příliš dlouhá.' });
      return res.status(400).json({ error: 'Nahrávku se nepodařilo přečíst.' });
    });

  // A recorded question in (the raw audio as the request body), its text out.
  app.post('/api/jarvis/transcribe', authenticateToken, readAudio, async (req, res) => {
    if (!isVoiceConfigured()) return res.status(503).json({ error: 'Hlas není na serveru nastavený (chybí OPENAI_API_KEY).' });
    if (!Buffer.isBuffer(req.body) || req.body.length < 1000) return res.status(400).json({ error: 'Nahrávka je prázdná.' });
    if (!withinVoiceLimit(Number(req.user.id))) return res.status(429).json({ error: 'Hodinový limit hlasových požadavků je vyčerpaný.' });

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });
    try {
      res.json({ text: await transcribe(req.body, req.headers['content-type'], abort.signal, Number(req.user.id)) });
    } catch (error) {
      if (abort.signal.aborted) return;
      console.error('Jarvis: transcription failed:', error?.message ?? error);
      res.status(502).json({ error: 'Nahrávku se nepodařilo přepsat.' });
    }
  });

  // Text in, spoken MP3 out. The browser asks sentence by sentence, so the
  // first words play while the rest is still being made.
  app.post('/api/jarvis/speech', authenticateToken, async (req, res) => {
    if (!isVoiceConfigured()) return res.status(503).json({ error: 'Hlas není na serveru nastavený (chybí OPENAI_API_KEY).' });
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'Chybí text k přečtení.' });
    if (text.length > MAX_SPEECH_CHARS) return res.status(400).json({ error: 'Text k přečtení je příliš dlouhý.' });
    if (!withinVoiceLimit(Number(req.user.id))) return res.status(429).json({ error: 'Hodinový limit hlasových požadavků je vyčerpaný.' });

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });
    try {
      const options = { voice: req.body?.voice, speed: req.body?.speed };
      const audio = Buffer.from(await (await synthesize(text, abort.signal, Number(req.user.id), options)).arrayBuffer());
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.end(audio);
    } catch (error) {
      if (abort.signal.aborted) return;
      console.error('Jarvis: speech synthesis failed:', error?.message ?? error);
      res.status(502).json({ error: 'Odpověď se nepodařilo přečíst.' });
    }
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
      const conversation = await store.get(req.params.id, Number(req.user.id));
      const removed = await store.remove(req.params.id, Number(req.user.id));
      res.status(removed ? 204 : 404).end();
      if (removed && conversation) void deleteFiles(conversationFileIds(conversation.messages));
    } catch (error) {
      console.error('Jarvis: deleting a conversation failed:', error);
      res.status(500).json({ error: 'Nepodařilo se smazat konverzaci.' });
    }
  });

  // The user's decision on a proposed change: apply it (through this server's
  // API as the AI agent acting for them, its own changeset in the change log)
  // or turn it down. Either way the outcome joins the transcript, and Jarvis
  // hears about it with the next message.
  app.post('/api/jarvis/conversations/:id/proposals/:proposalId', authenticateToken, async (req, res) => {
    const userId = Number(req.user.id);
    const decision = req.body?.decision;
    if (decision !== 'apply' && decision !== 'reject') return res.status(400).json({ error: 'Neznámé rozhodnutí.' });
    if (!UUID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Konverzace nenalezena.' });
    if (running.has(req.params.id)) return res.status(409).json({ error: 'Počkejte, až Jarvis dokončí odpověď.' });

    let conversation;
    try {
      conversation = await store.get(req.params.id, userId);
    } catch (error) {
      console.error('Jarvis: loading a conversation failed:', error);
      return res.status(500).json({ error: 'Nepodařilo se načíst konverzaci.' });
    }
    if (!conversation) return res.status(404).json({ error: 'Konverzace nenalezena.' });
    const transcript = conversation.transcript ?? [];
    const proposal = transcript.find((item) => item.type === 'proposal' && item.proposal?.id === req.params.proposalId)?.proposal;
    if (!proposal) return res.status(404).json({ error: 'Návrh nenalezen.' });
    if (transcript.some((item) => item.type === 'proposal_status' && item.id === proposal.id)) {
      return res.status(409).json({ error: 'Tento návrh už je vyřízený.' });
    }

    running.add(conversation.id);
    try {
      let status = 'rejected';
      let error;
      if (decision === 'apply') {
        if (req.user.role === 'viewer') {
          status = 'failed';
          error = 'Máte jen přístup ke čtení.';
        } else {
          const api = createApiClient({
            baseUrl,
            token: signAgentToken(req.user),
            changesetId: `jarvis-${conversation.id.slice(0, 8)}-${proposal.id.slice(0, 8)}`,
            note: `Jarvis, potvrzeno uživatelem: ${truncate(describeProposal(proposal), 300)}`,
          });
          try {
            await applyProposal(proposal, api);
            status = 'applied';
          } catch (applyError) {
            if (applyError instanceof ProposalError) {
              status = 'stale';
              error = applyError.message;
            } else {
              status = 'failed';
              error = applyError?.status === 403 ? 'Na tento záznam nemáte oprávnění.' : 'Změnu se nepodařilo provést.';
              console.error('Jarvis: applying a proposal failed:', applyError?.message ?? applyError);
            }
          }
        }
      }
      const item = { type: 'proposal_status', id: proposal.id, status, ...(error ? { error } : {}), at: new Date().toISOString() };
      await store.append(conversation.id, userId, { messages: [], transcript: [item], usage: zeroUsage() });
      res.json(item);
    } catch (error) {
      console.error('Jarvis: recording a proposal decision failed:', error);
      res.status(500).json({ error: 'Rozhodnutí se nepodařilo uložit.' });
    } finally {
      running.delete(conversation.id);
    }
  });

  // A click on a calendar card: undo an addition or an edit, confirm or keep a
  // proposed deletion, or restore a deleted event. Through the calendar API
  // as the AI agent acting for the user; the outcome joins the transcript.
  app.post('/api/jarvis/conversations/:id/calendar/:cardId', authenticateToken, async (req, res) => {
    const userId = Number(req.user.id);
    const action = req.body?.action;
    if (!['undo', 'confirm', 'keep'].includes(action)) return res.status(400).json({ error: 'Neznámá akce.' });
    if (!UUID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Konverzace nenalezena.' });
    if (running.has(req.params.id)) return res.status(409).json({ error: 'Počkejte, až Jarvis dokončí odpověď.' });

    let conversation;
    try {
      conversation = await store.get(req.params.id, userId);
    } catch (error) {
      console.error('Jarvis: loading a conversation failed:', error);
      return res.status(500).json({ error: 'Nepodařilo se načíst konverzaci.' });
    }
    if (!conversation) return res.status(404).json({ error: 'Konverzace nenalezena.' });
    const transcript = conversation.transcript ?? [];
    const card = transcript.find((item) => item.type === 'calendar' && item.card?.id === req.params.cardId)?.card;
    if (!card) return res.status(404).json({ error: 'Karta nenalezena.' });
    const state = cardState(card, transcript.filter((item) => item.type === 'calendar_status'));

    running.add(conversation.id);
    try {
      const api = createApiClient({
        baseUrl,
        token: signAgentToken(req.user),
        changesetId: `jarvis-${conversation.id.slice(0, 8)}-${card.id.slice(0, 8)}-${action}`,
        note: `Jarvis, kalendář (${action === 'undo' ? 'vráceno uživatelem' : action === 'confirm' ? 'smazání potvrzeno uživatelem' : 'ponecháno'}): ${truncate(card.title, 120)}`,
      });
      let outcome;
      try {
        outcome = await decideCalendarCard(card, state, action, api);
      } catch (error) {
        if (error instanceof CalendarError) return res.status(409).json({ error: error.message });
        console.error('Jarvis: a calendar card action failed:', error?.message ?? error);
        outcome = { status: 'failed', error: 'Kalendář se nepodařilo změnit.' };
      }
      const item = { type: 'calendar_status', id: card.id, ...outcome, at: new Date().toISOString() };
      await store.append(conversation.id, userId, { messages: [], transcript: [item], usage: zeroUsage() });
      res.json(item);
    } catch (error) {
      console.error('Jarvis: recording a calendar decision failed:', error);
      res.status(500).json({ error: 'Rozhodnutí se nepodařilo uložit.' });
    } finally {
      running.delete(conversation.id);
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
    const attachmentIds = Array.isArray(req.body?.attachments)
      ? req.body.attachments.filter((id) => typeof id === 'string').slice(0, MAX_ATTACHMENTS)
      : [];
    if (!text && attachmentIds.length === 0) return res.status(400).json({ error: 'Napište zprávu.' });
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
    const attachments = attachmentIds.length ? pendingAttachments.take(userId, attachmentIds) : [];
    if (!attachments) return res.status(400).json({ error: 'Přílohu se nepodařilo najít – nahrajte ji prosím znovu.' });
    // A message of attachments alone still needs a question.
    const question = text || (attachments.length === 1 ? 'Prohlédni si přílohu a řekni mi, co obsahuje.' : 'Prohlédni si přílohy a řekni mi, co obsahují.');

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
        await store.create({ id: conversationId, userId, title: truncate((text || attachments[0]?.name || '').replace(/\s+/g, ' '), 70), model: JARVIS_MODEL });
      }
      running.add(conversationId);
      emit('conversation', { id: conversationId, isNew: !conversation });

      const userMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildContextBlock(
              user,
              req.body?.context,
              attachments.map((attachment) => attachment.name),
              [...proposalOutcomes(conversation?.transcript), ...calendarOutcomes(conversation?.transcript)]
            ),
          },
          ...attachments.map(attachmentBlock),
          { type: 'text', text: question },
        ],
      };
      await store.append(conversationId, userId, {
        messages: [userMessage],
        transcript: [
          {
            type: 'question',
            text,
            at: new Date().toISOString(),
            ...(req.body?.context?.voice === true ? { voice: true } : {}),
            ...(attachments.length ? { attachments: attachments.map((attachment) => ({ name: attachment.name, kind: attachment.kind })) } : {}),
          },
        ],
        usage: zeroUsage(),
      });

      const pendingActions = [];
      const api = createApiClient({
        baseUrl,
        token: signAgentToken(user),
        changesetId: `jarvis-${conversationId.slice(0, 8)}-${Date.now().toString(36)}`,
        note: `Jarvis: ${truncate(question, 200)}`,
      });
      const toolContext = {
        api,
        user,
        sections: sectionsForScope(user.accessScope ?? user.access_scope),
        // Stopping the answer also stops a long document transcription.
        signal: abort.signal,
        emitAction: (action) => {
          pendingActions.push({ type: 'action', action });
          emit('action', action);
        },
        // A proposed change: shown as a card, applied only when confirmed.
        emitProposal: (proposal) => {
          pendingActions.push({ type: 'proposal', proposal });
          emit('proposal', proposal);
        },
        // A calendar change (made, or a deletion awaiting the user's click).
        emitCalendar: (card) => {
          pendingActions.push({ type: 'calendar', card });
          emit('calendar', card);
        },
      };

      const result = await runJarvisTurn({
        // An empty assistant message (stored by older versions when a reply
        // had no text) makes the API reject the whole history; skip it.
        history: [...(conversation?.messages ?? []).filter(isReplayable), userMessage],
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
      recordAiUsage({ provider: 'anthropic', model: JARVIS_MODEL, feature: 'jarvis', userId, ...result.usage });
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
