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
  documentResource,
  entitiesPath,
  recordRef,
  sectionsForScope,
  subjectName,
  truncate,
} from './catalog.js';
import { createFileConversationStore, createPgConversationStore } from './store.js';
import {
  MAX_AUDIO_BYTES,
  MAX_SPEECH_CHARS,
  TTS_SPEED,
  TTS_SPEEDS,
  TTS_VOICE,
  availableEngines,
  availableProviders,
  defaultEngine,
  isVoiceConfigured,
  synthesize,
  readTranscriptionHints,
  transcribe,
} from './voice.js';
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
import { estimateCostUsd } from '../finance/pricing.js';
import { recordAiUsage, recordJarvisTurn } from '../finance/usage.js';
import { ProposalError, applyProposal, describeProposal } from './proposals.js';
import { CalendarError, calendarOutcomes, cardState, decideCalendarCard } from './calendarActions.js';
import { computeAttention, createAttentionCache } from './attention.js';
import { exportSheets, loadRows } from './tools.js';
import { DocumentError, renderDocument } from './documentMaker.js';

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
// A team chat message that asks Jarvis something ("@Jarvis kolik…").
export const JARVIS_MENTION = /(^|\s)@jarvis\b/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const zeroUsage = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

const PROPOSAL_STATUS_TEXT = {
  applied: 'uživatel potvrdil, provedeno',
  rejected: 'uživatel zamítl, neprovedeno',
  stale: 'neprovedeno – záznam se mezitím změnil',
  failed: 'provedení selhalo',
};

// How a question ended, for the usage view: 'ok' is an answer the user got
// (cut short by max_tokens is 'truncated'); 'stopped' is the user's own stop.
export function turnStatus(stopReason, answered) {
  if (!stopReason) return 'error';
  if (stopReason === 'aborted') return 'stopped';
  if (stopReason === 'end_turn') return answered ? 'ok' : 'empty';
  if (stopReason === 'max_tokens') return 'truncated';
  return stopReason; // error, refusal, tool_limit
}

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
  if (context?.teamChat === true) {
    lines.push('Režim: týmový chat. Odpověď uvidí celý tým v místnosti, proto odpovídáš jen z Veřejné sekce (kterou vidí každý) a jen čtením, bez návrhů, karet a souborů. Data z Neveřejné sekce ani Growth Clubu do odpovědi nedávej, i když by je uživatel v aplikaci otevřít mohl; řekni, že v místnosti na ně nedosáhneš a ať se zeptá ve svém panelu Jarvise.');
  }
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
  // browser uses its own (lower quality) speech engines. `providers` and
  // their `engines` (each with its voices) are what a user can pick, with
  // the default engine, voice and speed. ElevenLabs only with its key.
  app.get('/api/jarvis/status', authenticateToken, (_req, res) => {
    const voice = isVoiceConfigured();
    res.json({
      available: isJarvisConfigured(),
      model: JARVIS_MODEL,
      voice,
      ...(voice
        ? {
            providers: availableProviders(),
            engines: availableEngines(),
            defaultEngine: defaultEngine(),
            defaultVoice: TTS_VOICE,
            speeds: TTS_SPEEDS,
            defaultSpeed: TTS_SPEED,
          }
        : {}),
    });
  });

  // What needs the user's attention (the launcher's number and the panel's
  // reminders). Plain rules over their data, no AI; cached for a few minutes.
  const attentionCache = createAttentionCache();
  app.get('/api/jarvis/attention', authenticateToken, async (req, res) => {
    try {
      const user = req.user;
      const value = await attentionCache.get(
        Number(user.id),
        () =>
          computeAttention({
            api: createApiClient({ baseUrl, token: signAgentToken(user), changesetId: null, note: null }),
            user,
            sections: sectionsForScope(user.accessScope ?? user.access_scope),
            roles: ROLES,
            loadRows,
          }),
        { fresh: req.query.fresh === '1' }
      );
      res.json(value);
    } catch (error) {
      console.error('Jarvis: the attention check failed:', error?.message ?? error);
      res.status(500).json({ error: 'Upozornění se nepodařilo načíst.' });
    }
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
      const hints = readTranscriptionHints(req.headers['x-jarvis-hints']);
      res.json({ text: await transcribe(req.body, req.headers['content-type'], abort.signal, Number(req.user.id), hints) });
    } catch (error) {
      if (abort.signal.aborted) return;
      console.error('Jarvis: transcription failed:', error?.message ?? error);
      res.status(502).json({ error: 'Nahrávku se nepodařilo přepsat.' });
    }
  });

  // Text in, speech out (WAV or MP3, by engine). The browser asks sentence by
  // sentence, so the first words play while the rest is still being made.
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
      const options = { voice: req.body?.voice, speed: req.body?.speed, engine: req.body?.engine };
      const { audio, contentType } = await synthesize(text, abort.signal, Number(req.user.id), options);
      res.setHeader('Content-Type', contentType);
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
      // A document card without what it was made from (that stays on the server).
      const transcript = (conversation.transcript ?? []).map((item) =>
        item.type === 'document' ? { type: 'document', document: item.document } : item
      );
      res.json({ id: conversation.id, title: conversation.title, transcript });
    } catch (error) {
      console.error('Jarvis: loading a conversation failed:', error);
      res.status(500).json({ error: 'Nepodařilo se načíst konverzaci.' });
    }
  });

  // A file Jarvis made in this conversation, rendered again from what was
  // asked for. An export reads the rows now, as the downloading user (only
  // the conversation's owner can reach it).
  app.get('/api/jarvis/conversations/:id/documents/:docId', authenticateToken, async (req, res) => {
    try {
      if (!UUID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Konverzace nenalezena.' });
      const conversation = await store.get(req.params.id, Number(req.user.id));
      const item = (conversation?.transcript ?? []).find((entry) => entry.type === 'document' && entry.document?.id === req.params.docId);
      if (!item?.spec) return res.status(404).json({ error: 'Soubor nenalezen.' });
      let spec = item.spec;
      if (spec.kind === 'export') {
        const ctx = {
          api: createApiClient({ baseUrl, token: signAgentToken(req.user) }),
          user: req.user,
          sections: sectionsForScope(req.user.accessScope ?? req.user.access_scope),
        };
        spec = { format: 'xlsx', title: spec.query.title, sheets: await exportSheets(ctx, spec.query) };
      }
      const file = await renderDocument(spec);
      res.setHeader('Content-Type', file.type);
      // The plain name for old browsers, the real one (with diacritics) for the rest.
      const ascii = file.filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
      res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
      res.setHeader('Cache-Control', 'no-store');
      res.end(file.buffer);
    } catch (error) {
      if (error instanceof DocumentError) return res.status(400).json({ error: error.message });
      if (error?.status === 403) return res.status(403).json({ error: 'K těmto datům už nemáte přístup.' });
      console.error('Jarvis: making a document failed:', error);
      res.status(500).json({ error: 'Soubor se nepodařilo vytvořit.' });
    }
  });

  // Files a Jarvis-made document under a subject's Dokumenty: the subject the
  // card names, or the one the body names (the profile the user has open).
  // Uploaded through the app's own documents route, as the user (tagged as
  // Jarvis's work in the change log), so section access applies.
  app.post('/api/jarvis/conversations/:id/documents/:docId/save', authenticateToken, async (req, res) => {
    try {
      if (!UUID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Konverzace nenalezena.' });
      const userId = Number(req.user.id);
      const conversation = await store.get(req.params.id, userId);
      const item = (conversation?.transcript ?? []).find((entry) => entry.type === 'document' && entry.document?.id === req.params.docId);
      if (!item?.spec) return res.status(404).json({ error: 'Soubor nenalezen.' });
      const asked = req.body?.subject ?? item.document.related;
      const section = asked?.section;
      const role = asked?.role;
      const id = Number(asked?.id);
      if (!SECTIONS.includes(section) || !ROLES.includes(role) || !Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Není jasné, ke kterému subjektu soubor uložit.' });
      }
      if (!sectionsForScope(req.user.accessScope ?? req.user.access_scope).includes(section)) {
        return res.status(403).json({ error: `Do sekce ${SECTION_LABELS[section]} nemáte přístup.` });
      }
      const api = createApiClient({
        baseUrl,
        token: signAgentToken(req.user),
        changesetId: `jarvis-${req.params.id.slice(0, 8)}-${Date.now().toString(36)}`,
        note: `Jarvis: uložen soubor ${truncate(item.document.filename, 120)}`,
      });
      const record = await api.get(`${entitiesPath(section, role)}/${id}`);
      let spec = item.spec;
      if (spec.kind === 'export') {
        const ctx = { api, user: req.user, sections: sectionsForScope(req.user.accessScope ?? req.user.access_scope) };
        spec = { format: 'xlsx', title: spec.query.title, sheets: await exportSheets(ctx, spec.query) };
      }
      const file = await renderDocument(spec);
      const created = await api.upload(`/${documentResource(section, role)}/${id}/documents`, {
        buffer: file.buffer,
        filename: file.filename,
        contentType: file.type,
      });
      const saved = {
        type: 'document_saved',
        documentId: item.document.id,
        subject: { section, role, id, label: truncate(`${record.entity_id ?? ''} · ${subjectName(record)}`, 120) },
        storedId: created?.id ?? null,
        at: new Date().toISOString(),
      };
      await store.append(conversation.id, userId, { messages: [], transcript: [saved], usage: zeroUsage() });
      res.json(saved);
    } catch (error) {
      if (error instanceof DocumentError) return res.status(400).json({ error: error.message });
      if (error?.status === 403) return res.status(403).json({ error: 'K tomuto subjektu nemůžete ukládat dokumenty.' });
      if (error?.status === 404) return res.status(404).json({ error: 'Subjekt nenalezen.' });
      console.error('Jarvis: saving a document to a subject failed:', error);
      res.status(500).json({ error: 'Soubor se nepodařilo uložit.' });
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

    // What the admins' usage view keeps about this question (finance_ai_turns).
    const startedAt = Date.now();
    const turnLog = { firstTextMs: null, tools: [], failedTools: 0, error: null, answered: false };
    const emit = (event, data) => {
      if (event === 'text' && turnLog.firstTextMs === null) turnLog.firstTextMs = Date.now() - startedAt;
      else if (event === 'tool' && data?.name && data.name !== 'compaction') turnLog.tools.push(data.name);
      else if (event === 'tool_done' && data?.ok === false) turnLog.failedTools += 1;
      else if (event === 'error') turnLog.error = data?.message ?? null;
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    let conversationId = conversation?.id ?? null;
    let result = null;
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
        // An e-mail draft: shown as an editable card, never sent by Jarvis.
        emitEmail: (draft) => {
          pendingActions.push({ type: 'email', draft });
          emit('email', draft);
        },
        // A calendar change (made, or a deletion awaiting the user's click).
        emitCalendar: (card) => {
          pendingActions.push({ type: 'calendar', card });
          emit('calendar', card);
        },
        // A file to download. `spec` (what it is made from) stays in the
        // stored transcript for re-rendering; the browser gets the card.
        emitDocument: (document, spec) => {
          pendingActions.push({ type: 'document', document, spec });
          emit('document', document);
        },
      };

      result = await runJarvisTurn({
        // An empty assistant message (stored by older versions when a reply
        // had no text) makes the API reject the whole history; skip it.
        history: [...(conversation?.messages ?? []).filter(isReplayable), userMessage],
        toolContext,
        emit,
        signal: abort.signal,
        onStep: (messages, transcript) => {
          if (transcript.some((item) => item.type === 'answer')) turnLog.answered = true;
          return store.append(conversationId, userId, {
            messages,
            transcript: [...transcript, ...pendingActions.splice(0)],
            usage: zeroUsage(),
          });
        },
      });

      await store.append(conversationId, userId, {
        messages: [],
        transcript: pendingActions.splice(0),
        usage: result.usage,
      });
      recordAiUsage({ provider: 'anthropic', model: JARVIS_MODEL, feature: 'jarvis', userId, ...result.usage });
      if (result.usage.webSearches) {
        recordAiUsage({ provider: 'anthropic', model: JARVIS_MODEL, feature: 'web_search', userId, units: result.usage.webSearches });
      }
      console.log(
        `Jarvis turn: user ${userId}, ${result.stopReason}, tokens in ${result.usage.input} / out ${result.usage.output}` +
        ` / cache read ${result.usage.cacheRead} / cache write ${result.usage.cacheWrite}`
      );
      emit('done', { stopReason: result.stopReason });
    } catch (error) {
      console.error('Jarvis turn failed:', error);
      emit('error', { message: 'Jarvis narazil na chybu a odpověď nedokončil.' });
      turnLog.error = truncate(String(error?.message ?? error), 300);
    } finally {
      if (conversationId) running.delete(conversationId);
      if (!res.writableEnded) res.end();
      const usage = result?.usage ?? zeroUsage();
      const webSearches = usage.webSearches ?? 0;
      recordJarvisTurn({
        userId,
        conversationId,
        question: truncate(text || attachments.map((attachment) => attachment.name).join(', '), 300),
        voice: req.body?.context?.voice === true,
        status: turnStatus(result?.stopReason, turnLog.answered),
        stopReason: result?.stopReason ?? null,
        error: turnLog.error,
        durationMs: Date.now() - startedAt,
        firstTextMs: turnLog.firstTextMs,
        tools: turnLog.tools,
        failedTools: turnLog.failedTools,
        input: usage.input,
        output: usage.output,
        cacheRead: usage.cacheRead,
        cacheWrite: usage.cacheWrite,
        webSearches,
        costUsd:
          (estimateCostUsd({ provider: 'anthropic', model: JARVIS_MODEL, feature: 'jarvis', ...usage }) ?? 0) +
          (estimateCostUsd({ provider: 'anthropic', model: JARVIS_MODEL, feature: 'web_search', units: webSearches }) ?? 0),
      });
    }
  });

  // @Jarvis in Týmový chat: one answer, posted to the room as "Jarvis". The
  // room is read by the whole team, so the answer is limited to the public
  // section (the standard access scope, enforced by the API too) and to the
  // tools that neither write nor leave a card (runTool, TEAM_CHAT_BLOCKED_TOOLS).
  const answerInRoom = async ({ question, user, postReply }) => {
    const roomUser = { ...user, accessScope: 'standard' };
    if (!isJarvisConfigured()) return postReply('Jarvis není nastavený (chybí ANTHROPIC_API_KEY).');
    if (!withinHourlyLimit(Number(user.id))) return postReply(`Limit ${HOURLY_LIMIT} zpráv za hodinu je vyčerpaný. Zkuste to později.`);
    const text = question.replace(JARVIS_MENTION, ' ').trim() || 'Co potřebuješ vědět?';
    const userMessage = {
      role: 'user',
      content: [
        { type: 'text', text: buildContextBlock(roomUser, { view: 'Týmový chat', teamChat: true }) },
        { type: 'text', text },
      ],
    };
    const api = createApiClient({
      baseUrl,
      token: signAgentToken(roomUser),
      changesetId: `jarvis-room-${Date.now().toString(36)}`,
      note: `Jarvis v týmovém chatu: ${truncate(text, 200)}`,
    });
    const noop = () => {};
    const toolContext = {
      api,
      user: roomUser,
      teamChat: true,
      sections: sectionsForScope('standard'),
      signal: new AbortController().signal,
      emitAction: noop,
      emitProposal: noop,
      emitEmail: noop,
      emitCalendar: noop,
      emitDocument: noop,
    };
    let answer = '';
    try {
      const result = await runJarvisTurn({
        history: [userMessage],
        toolContext,
        emit: noop,
        signal: new AbortController().signal,
        onStep: (_messages, transcript) => {
          for (const item of transcript) if (item.type === 'answer') answer = item.text;
          return Promise.resolve();
        },
      });
      recordAiUsage({ provider: 'anthropic', model: JARVIS_MODEL, feature: 'jarvis', userId: Number(user.id), ...result.usage });
      if (result.usage.webSearches) {
        recordAiUsage({ provider: 'anthropic', model: JARVIS_MODEL, feature: 'web_search', userId: Number(user.id), units: result.usage.webSearches });
      }
    } catch (error) {
      console.error('Jarvis room answer failed:', error);
    }
    await postReply(answer || 'Na to teď neumím odpovědět. Zkuste se zeptat jinak.');
  };

  return { store, answerInRoom };
}
